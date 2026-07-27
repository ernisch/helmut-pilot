"use strict";

// Herausgebernamen erzeugen niemals Vorgangsidentitaet — Hotfix B4-4.
// =============================================================================
// REINE LOGIK: kein Netz, keine KI, keine DB.
//
// DER FEHLER, DEN DIESE DATEI DAUERHAFT AUSSCHLIESST (Production 2026-07-27):
// Das Dokument "Kai Wegner zu queeren Rechten … - Tagesspiegel" wurde einem
// fachfremden Vorgang zugeschlagen. Der Herausgebername stand als TITELSUFFIX im
// Text und wurde damit zu einem ganz normalen Anker. Mit 13 Zeichen lag er ueber
// STRONG_ANCHOR_LEN und galt als STARKER Beleg (Gewicht 2) — er erfuellte
// MIN_BEWEISGEWICHT also ALLEIN. Da der Zielvorgang bereits mehrere
// Tagesspiegel-Artikel enthielt, genuegte der gemeinsame Herausgeber fuer eine
// Zusammenfuehrung.
//
// ZWEI UNABHAENGIGE RIEGEL, die dieser Test einzeln nachweist:
//   A  STRUKTURELL (ohne Wortliste): der bestaetigte Herausgebersuffix wird vor
//      der Ankerbildung abgeschnitten — auch bei Herausgebern, die in keiner
//      Liste stehen. Bestaetigt heisst: gedeckt durch die Herausgeberangaben
//      DESSELBEN Dokuments oder strukturell als Herausgeberbezeichnung erkennbar.
//   B  AUFGEZAEHLT: bekannte Medien-, Agentur- und Plattformnamen sind ueberall
//      nicht-spezifisch — auch mitten im Text und in der Abkuerzungsschreibweise
//      ("FAZ", "dpa", "DIE ZEIT").
//
// Jeder Riegel traegt eine GEGENPROBE (Abschnitt 9), damit keine Assertion
// zufaellig gruen ist: was NICHT Herausgeber ist, muss unveraendert tragen.

const V = require("../lib/helmut/vorgang-identity");
const H = require("../lib/helmut/herausgeber");
const { understandOneCluster } = require("../lib/helmut/understanding");

let fail = 0;
let n = 0;
function check(name, cond, detail = "") {
  n += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) fail += 1;
}

// Ein Rohdokument, wie es der Crawler aus einem Google-News-RSS-Eintrag baut:
// Titel mit Herausgebersuffix, Quellenname aus dem <source>-Tag, Artikeladresse.
const doc = (id, title, quelle, url, published_at = "2026-07-25T10:00:00Z", summary = "") =>
  ({ id, title, source_name: quelle, url, summary, published_at });

const urteil = (neu, altDocs, vorgangId = "vg-test") =>
  V.sameVorgang({ documents: neu }, { vorgangId, documents: altDocs });

// ---------------------------------------------------------------------------
// REKONSTRUKTION DES STANDES VOR B4-4 — ausschliesslich zu Messzwecken.
// Sie belegt, dass die Assertions unten eine echte Verhaltensaenderung pruefen
// und nicht nur eine ohnehin bestehende Trennung wiederholen.
// Unterschied zur heutigen Fassung, und nur dieser:
//   * Anker aus dem UNGEKUERZTEN Titel (Herausgebersuffix bleibt drin)
//   * "generisch" ohne die Herausgeberliste
// NICHT WIEDERVERWENDEN.
// ---------------------------------------------------------------------------
const altAnker = (d) => V.anchorTokens(`${d.title || ""} ${d.summary || ""}`);
const altGenerisch = (a) =>
  V.GENERISCHE_ANKER.has(a) || V.GENERISCHE_FUNKTIONSWOERTER.has(a)
  || V.GENERISCHE_FAMILIEN.has(V.beweisfamilie(a)) || V.GENERISCHE_ANKER.has(V.beweisfamilie(a));
// Gewicht eines exakt gleichen Ankers nach der Regel VOR B4-4.
const altGewicht = (a) => {
  if (altGenerisch(a)) return 1;
  if (a.length >= V.STRONG_ANCHOR_LEN) return 2;
  if (a.length <= V.ACRONYM_STRONG_MAX_LEN && !V.HAEUFIGE_ABKUERZUNGEN.has(a)) return 2;
  return 1;
};
// Gemeinsame, nach alter Lesart SPEZIFISCHE Anker zweier Dokumentmengen.
const altGemeinsamSpezifisch = (aDocs, bDocs) => {
  const a = [...new Set(aDocs.flatMap(altAnker))];
  const b = new Set(bDocs.flatMap(altAnker));
  return a.filter((x) => b.has(x) && !altGenerisch(x));
};

// =========================================================================
// 1 · DER EXAKTE PRODUCTION-FALL (Tagesspiegel)
// =========================================================================
// Der Bestandsvorgang: zwei Tagesspiegel-Artikel ueber den Mietendeckel. Sie
// gehoeren fachlich zusammen — das ist ein GESUNDER Vorgang.
const TS_BESTAND = [
  doc("t1", "Mietendeckel vor dem Verfassungsgericht - Tagesspiegel", "Tagesspiegel", "https://www.tagesspiegel.de/berlin/mietendeckel-1", "2026-07-24T08:00:00Z"),
  doc("t2", "Senat verteidigt Mietendeckel gegen Kritik der Wohnungswirtschaft - Tagesspiegel", "Tagesspiegel", "https://www.tagesspiegel.de/berlin/mietendeckel-2", "2026-07-24T14:00:00Z")
];
// Das Dokument aus dem Production-Befund: voellig anderes Thema, gleicher Herausgeber.
const TS_FREMD = [
  doc("t3", "Kai Wegner zu queeren Rechten und dem Schutz der Community - Tagesspiegel", "Tagesspiegel", "https://www.tagesspiegel.de/berlin/wegner-queer", "2026-07-25T09:00:00Z")
];

const ts1 = altGemeinsamSpezifisch(TS_FREMD, TS_BESTAND);
check("1 · Ausgangslage: vor dem Fix war der Herausgebername der EINZIGE gemeinsame spezifische Anker",
  ts1.length === 1 && ts1[0] === "tagesspiegel", JSON.stringify(ts1));
check("1 · Ausgangslage: und er wog als langer Anker allein so viel wie das geforderte Beweisgewicht",
  altGewicht("tagesspiegel") >= V.MIN_BEWEISGEWICHT,
  `gewicht=${altGewicht("tagesspiegel")} noetig=${V.MIN_BEWEISGEWICHT}`);

check("1 · heute steht der Herausgebername in KEINER Ankermenge mehr",
  [...TS_BESTAND, ...TS_FREMD].every((d) => !V.docAnchors(d).includes("tagesspiegel")),
  JSON.stringify(V.docAnchors(TS_FREMD[0])));
check("1 · der Sachgehalt der Schlagzeile bleibt vollstaendig erhalten",
  V.docAnchors(TS_FREMD[0]).includes("wegner") && V.docAnchors(TS_FREMD[0]).includes("queeren"),
  JSON.stringify(V.docAnchors(TS_FREMD[0])));

const u1 = urteil(TS_FREMD, TS_BESTAND, "vg-mietendeckel");
check("1 · die Zusammenfuehrung wird abgelehnt", u1.gleich === false, `${u1.grund}`);
check("1 · und der Ablehnungsgrund ist benannt (kein stiller Ausgang)",
  ["kein-spezifischer-kerntreffer", "cluster-ohne-kern", "kernueberdeckung-zu-schwach"].includes(u1.grund), u1.grund);

// GEGENPROBE zum selben Bestand: eine echte Fortschreibung MUSS weiterhin tragen.
const TS_FORT = [doc("t4", "Verfassungsgericht kippt den Mietendeckel - Tagesspiegel", "Tagesspiegel", "https://www.tagesspiegel.de/berlin/mietendeckel-3", "2026-07-25T11:00:00Z")];
check("1 · GEGENPROBE: die echte Fortschreibung desselben Themas wird weiter getragen",
  urteil(TS_FORT, TS_BESTAND, "vg-mietendeckel").gleich === true,
  urteil(TS_FORT, TS_BESTAND, "vg-mietendeckel").grund);

// =========================================================================
// 2 · RIEGEL A — strukturelle Suffixerkennung mit Beleg
// =========================================================================
const suffixFaelle = [
  ["Rentenpaket beschlossen - SZ.de", "SZ.de", "https://www.sueddeutsche.de/politik/a", "Rentenpaket beschlossen", "quellenname"],
  ["Streit um Wehrpflicht - DIE ZEIT", "DIE ZEIT", "https://www.zeit.de/p/a", "Streit um Wehrpflicht", "quellenname"],
  ["Neue Zahlen zur Inflation - tagesschau.de", "Tagesschau Politik", "https://www.tagesschau.de/a", "Neue Zahlen zur Inflation", "domainform"],
  ["Habeck kritisiert Sparkurs - Frankfurter Rundschau", "FR", "https://www.fr.de/a", "Habeck kritisiert Sparkurs", "gattung"],
  ["Tariftabellen Metall und Elektro - IG Metall", "IG Metall", "https://www.igmetall.de/a", "Tariftabellen Metall und Elektro", "quellenname"],
  // Ohne jede Metadatenangabe: allein die Domainform im Suffix traegt den Beleg.
  ["Klimaziele verfehlt - Vietnam.vn", "", "", "Klimaziele verfehlt", "domainform"],
  ["Debatte um Buergergeld - Hasepost", "Hasepost", "https://www.hasepost.de/a", "Debatte um Buergergeld", "quellenname"]
];
for (const [titel, quelle, url, rumpfSoll, belegSoll] of suffixFaelle) {
  const d = doc("s", titel, quelle, url);
  const zerlegt = H.herausgeberSuffix(titel, H.herausgeberMetadaten(d));
  check(`2 · Suffix erkannt und belegt: "${titel.slice(0, 44)}…"`,
    zerlegt.rumpf === rumpfSoll && zerlegt.belege[0] === belegSoll,
    `rumpf="${zerlegt.rumpf}" beleg=${zerlegt.belege[0]}`);
}

// Der wichtigste Gegenfall: eine DACHZEILE benutzt dasselbe Trennzeichen. Hier
// steht der Sachgehalt HINTER dem Trenner — blindes Abschneiden haette ihn
// geloescht (gemessen: 613 von 1 000 Production-Titeln tragen so ein Segment).
const dachzeile = doc("dz",
  "Nach Angriff auf CSD in Berlin - Neukoellns Integrationsbeauftragte fordert entschlosseneres Vorgehen gegen Islamismus",
  "Deutschlandfunk Politik", "https://www.deutschlandfunk.de/a");
check("2 · GEGENPROBE Dachzeile: ein unbelegter Suffix wird NICHT abgeschnitten",
  H.titelRumpf(dachzeile) === dachzeile.title, H.titelRumpf(dachzeile));
check("2 · GEGENPROBE Dachzeile: der Sachgehalt hinter dem Trenner bleibt Anker",
  V.docAnchors(dachzeile).includes("islamismus") && V.docAnchors(dachzeile).includes("integrationsbeauftragte"),
  JSON.stringify(V.docAnchors(dachzeile)));

// Zweiter Gegenfall, feiner: eine Dachzeile, deren Schlagzeile ein Wort aus dem
// Verlagsvokabular ENTHAELT ("Bundestag" ist auch ein Herausgeber). Der
// schwaechste Suffixbeleg — ein einzelnes solches Wort — darf nur bei einem
// wirklich kurzen Segment greifen, sonst faellt echter Sachgehalt weg.
const dachzeileGattung = doc("dz2", "Debatte um die Wehrpflicht - Streit erreicht jetzt den Bundestag",
  "Deutschlandfunk Politik", "https://www.deutschlandfunk.de/b");
check("2 · GEGENPROBE: fuenf Woerter mit Verlagsvokabular sind KEIN Herausgeberbeleg",
  H.suffixBeleg("Streit erreicht jetzt den Bundestag", H.herausgeberMetadaten(dachzeileGattung)) === null,
  String(H.suffixBeleg("Streit erreicht jetzt den Bundestag", H.herausgeberMetadaten(dachzeileGattung))));
check("2 · GEGENPROBE: und der Sachgehalt dieser Schlagzeile bleibt vollstaendig",
  V.docAnchors(dachzeileGattung).includes("bundestag") && V.docAnchors(dachzeileGattung).includes("wehrpflicht"),
  JSON.stringify(V.docAnchors(dachzeileGattung)));
// Die kurze Form desselben Wortes IST ein Beleg — so steht sie in den Feeds.
check("2 · ein kurzes Segment aus Verlagsvokabular gilt weiter als Herausgeber",
  H.titelRumpf(doc("dz3", "Rentenpaket beschlossen - Deutscher Bundestag", "Deutscher Bundestag", "https://www.bundestag.de/a")) === "Rentenpaket beschlossen");

// Wiederholter Suffix, wie er in Feeds vorkommt.
check("2 · mehrfach angehaengter Herausgeber wird vollstaendig entfernt",
  H.titelRumpf(doc("w", "Bundeshaushalt im Bundesrat - SZ.de - SZ.de", "SZ.de", "https://www.sueddeutsche.de/a")) === "Bundeshaushalt im Bundesrat");

// Ein Titel, der NUR aus Herausgeberangaben besteht, traegt keinen Sachgehalt.
// In Production real vorhanden (Uebersichts-/Startseiten der Institutionsfeeds).
check("2 · ein Titel ohne Sachgehalt bekommt bewusst keine Anker (fail closed)",
  V.docAnchors(doc("h", "CDU/CSU-Fraktion im Deutschen Bundestag - CDU/CSU-Fraktion im Deutschen Bundestag",
    "CDU/CSU-Fraktion im Deutschen Bundestag", "https://www.cducsu.de/")).length === 0,
  JSON.stringify(V.docAnchors(doc("h", "CDU/CSU-Fraktion im Deutschen Bundestag - CDU/CSU-Fraktion im Deutschen Bundestag",
    "CDU/CSU-Fraktion im Deutschen Bundestag", "https://www.cducsu.de/"))));
check("2 · GEGENPROBE: ein Sachtitel desselben Feeds behaelt seine Anker",
  V.docAnchors(doc("h2", "Fraktion beschliesst Position zum Rentenpaket - CDU/CSU-Fraktion im Deutschen Bundestag",
    "CDU/CSU-Fraktion im Deutschen Bundestag", "https://www.cducsu.de/a")).includes("rentenpaket"));

// =========================================================================
// 3 · RIEGEL B — die Medien aus dem Hotfix-Auftrag, einzeln geprueft
// =========================================================================
// Fuer jedes Medium: ZWEI Bestandsdokumente zum selben Thema (ein gesunder
// Vorgang) und EIN drittes Dokument desselben Hauses zu einem voellig anderen
// Thema. Ohne den Fix trug allein der Herausgebername die Zusammenfuehrung.
const MEDIEN = [
  ["Tagesspiegel", "Der Tagesspiegel", "https://www.tagesspiegel.de/a"],
  ["DER SPIEGEL", "DER SPIEGEL", "https://www.spiegel.de/a"],
  ["DIE ZEIT", "DIE ZEIT", "https://www.zeit.de/a"],
  ["WELT", "WELT", "https://www.welt.de/a"],
  ["FOCUS online", "FOCUS online", "https://www.focus.de/a"],
  ["taz.de", "taz.de", "https://taz.de/a"],
  ["BILD", "BILD", "https://www.bild.de/a"],
  ["FAZ.NET", "FAZ.NET", "https://www.faz.net/a"],
  ["SZ.de", "SZ.de", "https://www.sueddeutsche.de/a"],
  ["Handelsblatt", "Handelsblatt", "https://www.handelsblatt.com/a"],
  ["MDR.DE", "MDR.DE", "https://www.mdr.de/a"],
  ["NDR.de", "NDR.de", "https://www.ndr.de/a"],
  ["WDR", "WDR", "https://www1.wdr.de/a"],
  ["BR24", "BR24", "https://www.br.de/a"],
  ["rbb24", "rbb24", "https://www.rbb24.de/a"],
  ["dpa", "dpa", "https://www.dpa.com/a"],
  ["Reuters", "Reuters", "https://www.reuters.com/a"],
  ["AP News", "AP News", "https://apnews.com/a"],
  ["AFP", "AFP", "https://www.afp.com/a"],
  ["Euronews", "Euronews", "https://de.euronews.com/a"],
  ["POLITICO", "POLITICO", "https://www.politico.eu/a"],
  ["CORRECTIV", "CORRECTIV", "https://correctiv.org/a"]
];

let medienGruen = 0;
let medienMitAltrisiko = 0;
for (const [suffix, quelle, url] of MEDIEN) {
  const bestand = [
    doc(`${suffix}-b1`, `Rentenpaket im Bundestag beschlossen - ${suffix}`, quelle, url, "2026-07-24T08:00:00Z"),
    doc(`${suffix}-b2`, `Rentenpaket: Koalition streitet im Bundestag weiter - ${suffix}`, quelle, url, "2026-07-24T16:00:00Z")
  ];
  const fremd = [doc(`${suffix}-n1`, `Hochwasserschutz an der Elbe wird ausgebaut - ${suffix}`, quelle, url, "2026-07-25T09:00:00Z")];

  const u = urteil(fremd, bestand, `vg-${suffix}`);
  const anker = V.docAnchors(fremd[0]);
  const herausgeberTokens = H.woerter(suffix);
  const sauber = herausgeberTokens.every((t) => !anker.includes(t));
  // Trug der Herausgebername VOR dem Fix? Nur dann ist dieser Fall ein echter
  // Nachweis — sonst wird er als "strukturell nie Anker" ausgewiesen.
  const altGemeinsam = altGemeinsamSpezifisch(fremd, bestand);
  if (altGemeinsam.length) medienMitAltrisiko += 1;
  if (u.gleich === false && sauber) medienGruen += 1;
  check(`3 · ${suffix}: gleicher Herausgeber, anderes Thema -> keine Zusammenfuehrung`,
    u.gleich === false && sauber,
    `${u.grund} · anker=${JSON.stringify(anker)}${altGemeinsam.length ? ` · vorher trug: ${JSON.stringify(altGemeinsam)}` : " · vorher schon ohne Ankerwirkung"}`);
}
check("3 · alle geprueften Medien sind sauber", medienGruen === MEDIEN.length, `${medienGruen}/${MEDIEN.length}`);
check("3 · und bei der Mehrheit war der Herausgebername vor dem Fix tatsaechlich der tragende Beleg",
  medienMitAltrisiko >= Math.ceil(MEDIEN.length / 2), `${medienMitAltrisiko}/${MEDIEN.length}`);

// Mediennamen sind auch MITTEN IM TEXT nicht spezifisch (dort greift kein Suffix).
const imText = ["tagesspiegel", "spiegel", "handelsblatt", "reuters", "euronews", "politico", "correctiv", "tagesschau", "deutschlandfunk", "dpa", "zeitung", "rundschau", "redaktion", "morgenpost"];
for (const wort of imText) {
  check(`3 · "${wort}" gilt ueberall als nicht-spezifisch`, V.istGenerisch(wort) === true);
}

// =========================================================================
// 4 · DER ZWEITE FEHLERWEG — Abkuerzungsschreibweise
// =========================================================================
// isAcronym() erkennt "DIE ZEIT"/"WELT"/"BILD"/"FAZ" als Abkuerzung; exakt
// gleiche Abkuerzungen galten als STARKER Beleg. Zwei Artikel derselben Zeitung
// erfuellten damit das geforderte Gewicht allein ueber den Zeitungsnamen.
check("4 · Ausgangslage: \"ZEIT\" wird strukturell als Abkuerzung erkannt", H.woerter("DIE ZEIT").length === 2 && V.isAcronym("ZEIT") === true);
check("4 · Ausgangslage: eine exakt gleiche Abkuerzung galt als starker Beleg", V.ACRONYM_STRONG_MAX_LEN >= 4);
for (const kuerzel of ["zeit", "welt", "bild", "faz", "taz", "dpa", "afp", "ard", "zdf", "rbb", "mdr", "wdr", "ndr"]) {
  check(`4 · Medienkuerzel "${kuerzel}" traegt kein spezifisches Gewicht mehr`,
    V.istGenerisch(kuerzel) === true && V.matchStaerke(kuerzel, kuerzel) === 1,
    `staerke=${V.matchStaerke(kuerzel, kuerzel)}`);
}
// Der Artikel aus "DIE ZEIT"/"DER SPIEGEL" ist selbst eine dreibuchstabige
// "Abkuerzung" und galt damit als STARKER Beleg. In Production nachgewiesen:
// der Kern von `vg-zeit-20260311-030001` (26 Dokumente) war
// ["bundesregierung", "die", "zeit"].
for (const artikel of ["die", "der", "das", "und"]) {
  check(`4 · das grossgeschriebene Funktionswort "${artikel}" traegt kein Gewicht mehr`,
    V.istGenerisch(artikel) === true && V.matchStaerke(artikel, artikel) === 1,
    `staerke=${V.matchStaerke(artikel, artikel)}`);
}
check("4 · und es steht gar nicht erst in der Ankermenge eines ZEIT-Artikels",
  !V.docAnchors(doc("z1", "Streit um die Wehrpflicht - DIE ZEIT", "DIE ZEIT", "https://www.zeit.de/a")).includes("die"),
  JSON.stringify(V.docAnchors(doc("z1", "Streit um die Wehrpflicht - DIE ZEIT", "DIE ZEIT", "https://www.zeit.de/a"))));

// GEGENPROBE: eine SACHliche Abkuerzung bleibt ein starker Beleg — ohne sie
// zerfiele der CSD-Vorgang (Nachweis aus B4-3).
check("4 · GEGENPROBE: \"csd\" bleibt ein starker Identitaetsbeleg", V.matchStaerke("csd", "csd") === 2);
check("4 · GEGENPROBE: \"eugh\" bleibt ein starker Identitaetsbeleg", V.matchStaerke("eugh", "eugh") === 2);

// =========================================================================
// 5 · MEHRERE MEDIEN UEBER DASSELBE EREIGNIS — muss zusammenfinden
// =========================================================================
const EREIGNIS = [
  doc("e1", "Angriff auf den CSD in Berlin - eine Tote und mehrere Verletzte - Tagesspiegel", "Tagesspiegel", "https://www.tagesspiegel.de/berlin/csd", "2026-07-25T22:10:00Z"),
  doc("e2", "Fahrzeug faehrt in Menschenmenge am Berliner CSD - SZ.de", "SZ.de", "https://www.sueddeutsche.de/panorama/csd", "2026-07-25T22:31:00Z"),
  doc("e3", "Berliner CSD abgebrochen: Polizei ermittelt nach dem Angriff - DIE ZEIT", "DIE ZEIT", "https://www.zeit.de/gesellschaft/csd", "2026-07-26T04:01:00Z"),
  doc("e4", "Anschlag am Rande des CSD in Berlin - Reuters", "Reuters", "https://www.reuters.com/world/csd", "2026-07-26T05:20:00Z")
];
const clusterE = V.clusterRawDocuments(EREIGNIS);
check("5 · vier Medien, ein Ereignis -> EIN Cluster",
  clusterE.length === 1 && clusterE[0].documents.length === 4,
  `${clusterE.length} Cluster: ${JSON.stringify(clusterE.map((c) => c.documents.map((d) => d.id)))}`);
check("5 · der gemeinsame Kern ist das EREIGNIS, nicht der Herausgeber",
  (() => {
    const kern = V.coreAnchors(EREIGNIS.map((d) => V.docAnchors(d)));
    return kern.includes("berlin") && kern.includes("csd") && !kern.some((a) => H.istHerausgeberAnker(a));
  })(), JSON.stringify(V.coreAnchors(EREIGNIS.map((d) => V.docAnchors(d)))));
check("5 · und ein fuenftes Medium wird demselben Vorgang zugeordnet",
  urteil([doc("e5", "Nach dem Angriff auf den Berliner CSD: Innensenator sagt Aufklaerung zu - WELT", "WELT", "https://www.welt.de/politik/csd", "2026-07-26T08:00:00Z")], EREIGNIS, "vg-csd").gleich === true,
  urteil([doc("e5", "Nach dem Angriff auf den Berliner CSD: Innensenator sagt Aufklaerung zu - WELT", "WELT", "https://www.welt.de/politik/csd", "2026-07-26T08:00:00Z")], EREIGNIS, "vg-csd").grund);

// =========================================================================
// 6 · MEHRERE ARTIKEL DESSELBEN MEDIUMS — Themen entscheiden, nicht das Haus
// =========================================================================
const EIN_HAUS = [
  doc("h1", "Rentenpaket im Bundestag beschlossen - Handelsblatt", "Handelsblatt", "https://www.handelsblatt.com/a1", "2026-07-25T08:00:00Z"),
  doc("h2", "Rentenpaket: Arbeitgeber warnen im Bundestag vor den Kosten - Handelsblatt", "Handelsblatt", "https://www.handelsblatt.com/a2", "2026-07-25T09:00:00Z"),
  doc("h3", "Hochwasserschutz an der Elbe wird ausgebaut - Handelsblatt", "Handelsblatt", "https://www.handelsblatt.com/a3", "2026-07-25T10:00:00Z"),
  doc("h4", "Deutsche Bahn meldet neuen Puenktlichkeitsrekord - Handelsblatt", "Handelsblatt", "https://www.handelsblatt.com/a4", "2026-07-25T11:00:00Z")
];
const clusterH = V.clusterRawDocuments(EIN_HAUS);
check("6 · vier Artikel desselben Hauses, drei Themen -> drei Cluster",
  clusterH.length === 3, `${clusterH.length}: ${JSON.stringify(clusterH.map((c) => c.documents.map((d) => d.id)))}`);
check("6 · die beiden Rentenartikel finden zusammen",
  clusterH.some((c) => c.documents.length === 2 && c.documents.every((d) => ["h1", "h2"].includes(d.id))),
  JSON.stringify(clusterH.map((c) => c.documents.map((d) => d.id))));

// Und dieselbe Probe ueber die Vorgangsaufloesung statt ueber die Clusterbildung.
check("6 · ein fremdes Thema desselben Hauses wird dem Rentenvorgang NICHT zugeschlagen",
  urteil([EIN_HAUS[3]], [EIN_HAUS[0], EIN_HAUS[1]], "vg-rentenpaket").gleich === false,
  urteil([EIN_HAUS[3]], [EIN_HAUS[0], EIN_HAUS[1]], "vg-rentenpaket").grund);

// =========================================================================
// 7 · VORGANGSKENNUNG — nie ein Herausgebername als Themenwurzel
// =========================================================================
// Production fuehrt heute 18 Vorgaenge mit Herausgeber-Themenwurzel, darunter
// `vg-tagesspiegel-20260519-f29ebd` und `vg-zeitung-20260428-f362cc`.
const kennungFaelle = [
  [TS_BESTAND, "mietendeckel"],
  [EIN_HAUS.slice(0, 2), "rentenpaket"],
  [EREIGNIS, "berlin"]
];
for (const [docs, wurzelSoll] of kennungFaelle) {
  const id = V.deriveVorgangId({ documents: docs });
  const wurzel = String(id).replace(/^vg-/, "").split("-")[0];
  check(`7 · Kennung traegt eine Sachwurzel, keinen Herausgeber: ${id}`,
    !H.istHerausgeberAnker(wurzel) && wurzel.length >= 4, `wurzel=${wurzel} erwartet~${wurzelSoll}`);
}
check("7 · auch die Kandidatenpraefixe enthalten keinen Herausgebernamen",
  V.candidatePrefixes({ documents: TS_BESTAND }, 3).every((p) => !H.istHerausgeberAnker(String(p).replace(/^vg-/, ""))),
  JSON.stringify(V.candidatePrefixes({ documents: TS_BESTAND }, 3)));

// =========================================================================
// 8 · GOOGLE-NEWS-SUFFIX EINES UNBEKANNTEN HERAUSGEBERS
// =========================================================================
// Der strukturelle Riegel darf keine Liste brauchen. Diese Haeuser stehen
// bewusst in KEINER Aufzaehlung dieses Repos.
const UNBEKANNT = [
  ["Ostsee-Anzeiger", "https://www.ostsee-anzeiger.example/a"],
  ["Kreisblatt Bergstrasse", "https://www.kreisblatt-bergstrasse.example/a"],
  ["Nordwest-Report", "https://nordwest-report.example/a"]
];
for (const [haus, url] of UNBEKANNT) {
  const bestand = [
    doc(`${haus}-1`, `Rentenpaket im Bundestag beschlossen - ${haus}`, haus, url, "2026-07-24T08:00:00Z"),
    doc(`${haus}-2`, `Rentenpaket: Koalition streitet im Bundestag weiter - ${haus}`, haus, url, "2026-07-24T16:00:00Z")
  ];
  const fremd = [doc(`${haus}-3`, `Hochwasserschutz an der Elbe wird ausgebaut - ${haus}`, haus, url, "2026-07-25T09:00:00Z")];
  const anker = V.docAnchors(fremd[0]);
  check(`8 · unbekannter Herausgeber "${haus}" wird strukturell erkannt`,
    H.woerter(haus).every((t) => !anker.includes(t)), JSON.stringify(anker));
  check(`8 · und stiftet keine Identitaet`, urteil(fremd, bestand, "vg-unbekannt").gleich === false);
}

// =========================================================================
// 9 · GEGENPROBEN — der Riegel darf nur Herausgeber treffen
// =========================================================================
// 9.1 Ein Sachbegriff, der zufaellig wie ein Titelname klingt, bleibt Anker,
//     solange er NICHT in Herausgeberposition steht.
const sachtext = doc("g1", "Bundestag debattiert ueber die Zukunft der Deutschen Post", "Deutschlandfunk Politik", "https://www.deutschlandfunk.de/a");
check("9 · ein Gattungswort MITTEN im Text bleibt im Titel stehen",
  H.titelRumpf(sachtext) === sachtext.title, H.titelRumpf(sachtext));

// 9.2 Ein Fachbegriff, der einen Medienname enthaelt, bleibt unangetastet:
//     "Pressefreiheit" ist ein eigenes Wort und kein Herausgeber.
check("9 · \"pressefreiheit\" bleibt ein spezifischer Anker", V.istGenerisch("pressefreiheit") === false);
check("9 · \"medienstaatsvertrag\" bleibt ein spezifischer Anker", V.istGenerisch("medienstaatsvertrag") === false);
check("9 · \"zeitungszustellung\" bleibt ein spezifischer Anker", V.istGenerisch("zeitungszustellung") === false);

// 9.3 Die uebrige Ankermechanik ist unveraendert (B4-3 bleibt gruen).
check("9 · generische Ereignisfamilien tragen weiterhin nichts", V.istGenerisch("angriffen") === true);
check("9 · spezifische Sachanker tragen weiterhin",
  V.istGenerisch("rentenpaket") === false && V.matchStaerke("emissionshandel", "emissionshandel") === 2);

// 9.4 Ein Dokument OHNE Herausgeberangaben verliert nichts.
const ohneMeta = { id: "g4", title: "Rentenpaket im Bundestag beschlossen", published_at: "2026-07-25T10:00:00Z" };
check("9 · ein Dokument ohne Herausgebermetadaten behaelt alle Anker",
  V.docAnchors(ohneMeta).join(",") === V.anchorTokens(ohneMeta.title).join(","), JSON.stringify(V.docAnchors(ohneMeta)));

// =========================================================================
// 10 · DURCHGEHENDER PFAD — der Resolver im echten Ablauf
// =========================================================================
function gueltigeAnalyse() {
  return {
    headline: "Wegner zu queeren Rechten",
    was_ist_passiert: "Der Regierende Buergermeister aeussert sich zum Schutz queerer Menschen.",
    warum_wichtig: "Beruehrt Innen- und Gleichstellungspolitik des Landes Berlin.",
    wer_ist_betroffen: "Queere Community, Berliner Senat, Polizei.",
    parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
    zeitdruck: "mittel", handlungsempfehlung: "Sprachregelung abstimmen.",
    confidence_score: 78,
    display_title: "Wegner zu queeren Rechten",
    display_summary: "Aeusserung zum Schutz queerer Menschen in Berlin.",
    why_relevant: "Innen- und Gleichstellungspolitik.",
    recommendation: "Position im Ausschuss vorbereiten.",
    display_category: "Innenpolitik"
  };
}

(async () => {
  const mietVorgang = {
    id: "ko-vg-mietendeckel", vorgang_id: "vg-mietendeckel-20260724-aa11bb",
    status: "neu", understanding_status: "complete", ko_version: 2,
    headline: "Mietendeckel vor dem Verfassungsgericht",
    created_at: "2026-07-24T09:00:00Z", updated_at: "2026-07-24T15:00:00Z"
  };
  const zustand = { gespeichert: [], verknuepft: [], kiAufrufe: [] };
  const deps = {
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async (p) => { zustand.kiAufrufe.push(p); return gueltigeAnalyse(); },
    save: async (ko) => { zustand.gespeichert.push(ko); return { saved: true, id: ko.id }; },
    saveSources: async (koId, docs) => { zustand.verknuepft.push({ koId, ids: docs.map((x) => x.id) }); },
    markFailed: async () => {},
    modelName: () => "test",
    logSkip: () => {},
    findVorgangCandidates: async () => [mietVorgang],
    listVorgangDocuments: async () => TS_BESTAND,
    getExisting: async () => mietVorgang
  };

  const cluster = V.clusterRawDocuments(TS_FREMD)[0];
  const ergebnis = await understandOneCluster(cluster, deps);
  check("10 · der fremde Artikel desselben Hauses bekommt einen EIGENEN Vorgang",
    ergebnis.status === "saved" && ergebnis.vorgangId !== mietVorgang.vorgang_id,
    `${ergebnis.status} ${ergebnis.vorgangId}`);
  check("10 · der Bestandsvorgang wird NICHT ueberschrieben",
    zustand.gespeichert.every((ko) => ko.vorgang_id !== mietVorgang.vorgang_id),
    JSON.stringify(zustand.gespeichert.map((k) => k.vorgang_id)));
  check("10 · das Rohdokument bleibt verknuepft (kein stiller Verlust)",
    zustand.verknuepft.length === 1 && zustand.verknuepft[0].ids.includes("t3"),
    JSON.stringify(zustand.verknuepft));
  check("10 · die Ablehnung ist telemetriert",
    ergebnis.resolverAbgelehnt >= 1 && Array.isArray(ergebnis.resolverAblehnungsgruende),
    JSON.stringify(ergebnis.resolverAblehnungsgruende));

  console.log(`\n${n - fail}/${n} Assertions erfolgreich.`);
  if (fail) { console.error(`${fail} Assertion(en) fehlgeschlagen.`); process.exit(1); }
  process.exit(0);
})();
