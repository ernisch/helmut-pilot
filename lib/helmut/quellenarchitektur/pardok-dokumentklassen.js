"use strict";

// Helmut — Quellenarchitektur · Dokumentklassen + kanonischer Rohdokument-Vertrag fuer die
// amtlichen Landesparlaments-Quellen Berlin (PARDOK) und Brandenburg (parldok).
// =============================================================================================
// WOFUER: Der Parser (pardok-parser.js) liefert die ROHEN Typbezeichnungen der Quelle
// (<DokArt>/<DokArtL>, <DokTyp>/<DokTypL>). Damit ist NICHT entschieden, ob ein Dokument eine
// Drucksache, eine Anfrage, eine Antwort oder ein Sitzungsdokument ist — genau das verlangt aber
// Roadmap-Punkt 24 ("Drucksachen, Anfragen, Sitzungen und Vorgaenge werden korrekt getrennt").
// Dieses Modul macht aus den Rohwerten eine NORMALISIERTE Dokumentklasse und bildet das Ergebnis
// auf den BESTEHENDEN kanonischen Rohdokument-Vertrag (public.raw_documents) ab.
//
// REIN, DETERMINISTISCH: kein Netz, keine DB, kein LLM, keine Uhr (Abrufzeit wird injiziert).
// Kein Schemawechsel, keine Migration, keine neue Parallelstruktur — ausschliesslich die
// vorhandenen Spalten aus storage.V3_RAW_DOCUMENT_COLUMNS + das bereits vorhandene `raw`-jsonb.
//
// DREI HARTE GRUNDSAETZE
// ---------------------------------------------------------------------------------------------
// 1. LAENDERSPEZIFISCH ERKENNEN, KANONISCH AUSGEBEN. Berlin und Brandenburg haben eigene
//    Typtabellen (BERLIN_* / BRANDENBURG_*). Gemeinsam ist NUR das Ergebnis (DOKUMENTKLASSEN)
//    und der Rohdokument-Vertrag. Es gibt bewusst KEINE gemeinsame Textmuster-Loesung.
// 2. FAIL CLOSED. Ein Typwert, der in keiner Tabelle steht, wird NIE geraten. Er bekommt die
//    Klasse `unbekannt` mit ausgewiesener Herkunft — lieber ehrlich unbekannt als falsch
//    einsortiert. Ein veraendertes Quellformat faellt damit auf, statt still falsch zu werden.
// 3. DOKUMENT IST NICHT VORGANG. `vorgang` ist KEINE Dokumentklasse. Ein Vorgang kann mehrere
//    Drucksachen, Anfragen, Antworten und Sitzungsdokumente enthalten; er wird hier ausschliesslich
//    als BEZUG (vorgangsnummer/vorgangstyp) mitgefuehrt. Dieses Modul bildet KEINE Vorgaenge und
//    setzt darum auch NIE `cluster_id` — die Vorgangsbildung bleibt vollstaendig beim
//    bestehenden Resolver (understanding.js).

const crypto = require("crypto");
const { normText } = require("./classification");

// --- Kanonische Dokumentklassen (das gemeinsame Ergebnis beider Laender) ----------------------
// Bewusst OHNE `vorgang` (Grundsatz 3). `unbekannt` ist der fail-closed-Zustand.
const DOKUMENTKLASSEN = Object.freeze([
  "drucksache",      // Drucksache jeder Auspraegung (Antrag, Gesetzentwurf, Verordnung, Bericht …)
  "anfrage",         // parlamentarische Anfrage (schriftlich, klein, gross, muendlich)
  "antwort",         // Antwort auf eine Anfrage
  "sitzung",         // Sitzungsdokument (Plenar-/Ausschussprotokoll, Behandlung im Plenum)
  "tagesordnung",    // Tagesordnung / Einladung / Termin
  "pressemitteilung",// Pressemitteilung eines amtlichen Herausgebers
  "sonstiges",       // amtlicher Inhalt ausserhalb der obigen Klassen (z. B. Verkuendungsblatt)
  "unbekannt"        // fail closed: Typ vorhanden, aber nicht belegt zuzuordnen — oder gar kein Typ
]);
const KLASSEN_SET = new Set(DOKUMENTKLASSEN);

// --- Belegregister ---------------------------------------------------------------------------
// Jeder Tabelleneintrag nennt seinen Beleg. Nichts steht hier "weil es plausibel ist".
const BELEGE = Object.freeze({
  "probe-be-2026-07-26":
    "Struktur-Sonde gegen die Live-Datei https://www.parlament-berlin.de/opendata/pardok-wp19.xml " +
    "(GitHub-Actions-Lauf 30209973678, 26.07.2026, 500 von 47 417 <Dokument>-Records; Feld-Inventar " +
    "DokArt/DokArtL/DokTyp/DokTypL je 100 %).",
  "probe-bb-2026-07-26":
    "Struktur-Sonde gegen die Live-Datei https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml " +
    "(GitHub-Actions-Lauf 30209973678, 26.07.2026, 500 von 9 057 <Vorgang>-Records; DokArt/DokArtL 53 %, " +
    "DokTyp/DokTypL 46 %, VTyp/VTypL 47 %).",
  "gold-fixture-be": "test/fixtures/pardok/berlin-gold.xml (versionierte Gold-Fixture aus derselben Quelle).",
  "gold-fixture-bb": "test/fixtures/pardok/brandenburg-gold.xml (versionierte Gold-Fixture aus derselben Quelle).",
  "amtliche-bezeichnung":
    "Amtliche deutsche Parlamentsbezeichnung, die das Projekt bereits in " +
    "understanding-gate.OFFICIAL_DOC_TYPES fuehrt. In der belegten Stichprobe beider Laender NICHT " +
    "beobachtet — deshalb nur nachrangige Auffangebene, nie laenderspezifischer Beleg."
});

function eintrag(klasse, beleg) {
  return Object.freeze({ klasse, beleg });
}

// --- BERLIN (Abgeordnetenhaus, PARDOK) -------------------------------------------------------
// Reihenfolge der Auswertung: <DokTyp*> vor <DokArt*>. Das ist keine Kosmetik, sondern belegt
// noetig: der reale Record D-351603 traegt DokArtL="Plenarprotokoll" UND DokTypL="Antwort" — er
// ist eine Antwort auf eine muendliche Anfrage, die im Plenarprotokoll steht. Ueber die Dokumentart
// allein waere er faelschlich ein reines Sitzungsdokument.
const BERLIN_TYPEN = Object.freeze({
  "schriftliche anfrage": eintrag("anfrage", "probe-be-2026-07-26"),
  "schranfr": eintrag("anfrage", "probe-be-2026-07-26"),
  "kleine anfrage": eintrag("anfrage", "gold-fixture-be"),
  "klanfr": eintrag("anfrage", "gold-fixture-be"),
  "antwort": eintrag("antwort", "probe-be-2026-07-26"),
  "a": eintrag("antwort", "probe-be-2026-07-26"),
  "behandlung im plenum": eintrag("sitzung", "probe-be-2026-07-26"),
  "ausschussberatung": eintrag("sitzung", "probe-be-2026-07-26"),
  "verordnung": eintrag("drucksache", "probe-be-2026-07-26"),
  "vo": eintrag("drucksache", "probe-be-2026-07-26"),
  "antrag": eintrag("drucksache", "gold-fixture-be"),
  "antr": eintrag("drucksache", "gold-fixture-be"),
  "gesetz und verordnungsblatt": eintrag("sonstiges", "probe-be-2026-07-26"),
  "gvbl": eintrag("sonstiges", "probe-be-2026-07-26")
});
const BERLIN_ARTEN = Object.freeze({
  "drucksache": eintrag("drucksache", "probe-be-2026-07-26"),
  "drs": eintrag("drucksache", "probe-be-2026-07-26"),
  "plenarprotokoll": eintrag("sitzung", "probe-be-2026-07-26"),
  "plpr": eintrag("sitzung", "probe-be-2026-07-26"),
  "ausschussprotokoll": eintrag("sitzung", "probe-be-2026-07-26"),
  "apr": eintrag("sitzung", "probe-be-2026-07-26"),
  "gesetz und verordnungsblatt": eintrag("sonstiges", "probe-be-2026-07-26"),
  "gvbl": eintrag("sonstiges", "probe-be-2026-07-26")
});

// --- BRANDENBURG (Landtag, parldok) ----------------------------------------------------------
// Eigene Tabelle, eigene Werte. "Antr mit Wahlvorschl" ist ein realer parldok-Kurzcode ohne
// Berliner Entsprechung; "SchrAnfr" existiert hier umgekehrt nicht (siehe KLASSEN_AUSNAHMEN).
const BRANDENBURG_TYPEN = Object.freeze({
  "kleine anfrage": eintrag("anfrage", "probe-bb-2026-07-26"),
  "klanfr": eintrag("anfrage", "probe-bb-2026-07-26"),
  "antrag": eintrag("drucksache", "probe-bb-2026-07-26"),
  "antr mit wahlvorschl": eintrag("drucksache", "probe-bb-2026-07-26"),
  "gesetzentwurf": eintrag("drucksache", "gold-fixture-bb"),
  "gent": eintrag("drucksache", "gold-fixture-bb")
});
const BRANDENBURG_ARTEN = Object.freeze({
  "drucksache": eintrag("drucksache", "probe-bb-2026-07-26"),
  "drs": eintrag("drucksache", "probe-bb-2026-07-26"),
  "plenarprotokoll": eintrag("sitzung", "probe-bb-2026-07-26"),
  "plpr": eintrag("sitzung", "probe-bb-2026-07-26")
});

// --- Nachrangige Auffangebene (LAENDERUNABHAENGIG, ausdruecklich schwaecherer Beleg) ----------
// Greift NUR, wenn die laenderspezifischen Tabellen nichts liefern. Enthaelt ausschliesslich
// amtliche deutsche Parlamentsbezeichnungen, keine Rateheuristik und keine Teilwortsuche.
const ALLGEMEINE_BEZEICHNUNGEN = Object.freeze({
  "grosse anfrage": "anfrage",
  "muendliche anfrage": "anfrage",
  "anfrage": "anfrage",
  "beschlussempfehlung": "drucksache",
  "beschlussempfehlung und bericht": "drucksache",
  "unterrichtung": "drucksache",
  "bericht": "drucksache",
  "entschliessungsantrag": "drucksache",
  "aenderungsantrag": "drucksache",
  "wahlvorschlag": "drucksache",
  "gesetz": "drucksache",
  "beschluss": "drucksache",
  "tagesordnung": "tagesordnung",
  "einladung": "tagesordnung",
  "pressemitteilung": "pressemitteilung",
  "presseerklaerung": "pressemitteilung"
});

// --- Fachlich begruendete Ausnahmen ----------------------------------------------------------
// Klassen, die eine Landesquelle nachweislich NICHT liefert. Sie werden NICHT simuliert und
// NICHT durch einen Nachbarwert ersetzt — sie sind hier als pruefbare Ausnahme dokumentiert.
const KLASSEN_AUSNAHMEN = Object.freeze([
  Object.freeze({
    land: "berlin", klasse: "tagesordnung",
    grund: "Der PARDOK-Export ist eine Dokumentendatenbank abgeschlossener Vorgaenge. Tagesordnungen " +
      "und Termine des Abgeordnetenhauses erscheinen dort nicht als eigene Dokumentart.",
    beleg: "probe-be-2026-07-26", ersatzweg: "rp-be-landesparlament (Suchweg, liefert sie als sonstigen Inhalt ohne document_type)"
  }),
  Object.freeze({
    land: "brandenburg", klasse: "tagesordnung",
    grund: "Auch der parldok-Export fuehrt keine Tagesordnungs-/Termindokumentart. Der Hinweis 'Einl' " +
      "taucht nur innerhalb der Fundstellenangabe <FundSt> auf, nicht als eigener Dokumenttyp.",
    beleg: "probe-bb-2026-07-26", ersatzweg: "rp-bb-landesparlament / rp-bb-ausschuesse (Suchwege)"
  }),
  Object.freeze({
    land: "berlin", klasse: "pressemitteilung",
    grund: "PARDOK ist kein Pressedienst. Pressemitteilungen kommen ueber die Presse-/Medienwege des " +
      "Landesmoduls, nicht ueber die Parlamentsdokumentation.",
    beleg: "probe-be-2026-07-26", ersatzweg: "rp-be-landesregierung, rp-be-staatskanzlei, rp-be-regionale_leitmedien"
  }),
  Object.freeze({
    land: "brandenburg", klasse: "pressemitteilung",
    grund: "parldok ist kein Pressedienst — identische Begruendung wie Berlin, andere Wege.",
    beleg: "probe-bb-2026-07-26", ersatzweg: "rp-bb-landesregierung, rp-bb-ministerien, rp-bb-regionale_leitmedien"
  }),
  Object.freeze({
    land: "brandenburg", klasse: "antwort",
    grund: "parldok fuehrt in der belegten Stichprobe KEINEN eigenen Dokumenttyp 'Antwort'. Antworten " +
      "der Landesregierung erscheinen als eigenstaendige Drucksache; ohne belegten Typwert waeren sie " +
      "von anderen Drucksachen nicht sicher zu trennen. Es wird deshalb bewusst NICHT geraten — solche " +
      "Dokumente bleiben `drucksache`, bis ein belegter Typwert vorliegt.",
    beleg: "probe-bb-2026-07-26", ersatzweg: null
  })
]);

// --- Vorgangsbezug je Land (Bezug, NICHT Vorgangsbildung) ------------------------------------
const VORGANGSBEZUG = Object.freeze({
  berlin: Object.freeze({
    verfuegbar: false, felder: [],
    grund: "Der Berliner Export enthaelt zwar <Vorgang>-Elemente (Sonde 26.07.2026: 41 854 <Vorgang> " +
      "neben 47 417 <Dokument>), deren Feldstruktur ist aber in keinem gespeicherten Beleg dokumentiert " +
      "und die Quelle ist aus der Arbeitsumgebung nicht erreichbar. Der Parser liest ausschliesslich " +
      "<Dokument>. Ein Vorgangsbezug wird deshalb NICHT erfunden: vorgangsnummer bleibt null.",
    beleg: "probe-be-2026-07-26"
  }),
  brandenburg: Object.freeze({
    verfuegbar: true, felder: ["vorgangsnummer (<VNr>)", "vorgangstyp (<VTypL>/<VTyp>)"],
    grund: "parldok liefert den Vorgang als Traeger-Element mit stabiler Nummer und Typ; mehrere " +
      "<Dokument> eines Vorgangs behalten ihre eigene Identitaet (VNr#ReihNr).",
    beleg: "probe-bb-2026-07-26"
  })
});

// --- Klassifizierung -------------------------------------------------------------------------
const LAND_TABELLEN = Object.freeze({
  berlin: Object.freeze({ typen: BERLIN_TYPEN, arten: BERLIN_ARTEN }),
  brandenburg: Object.freeze({ typen: BRANDENBURG_TYPEN, arten: BRANDENBURG_ARTEN })
});

function schluessel(wert) {
  const k = normText(wert);
  return k === "" ? null : k;
}

// Ein geparstes PARDOK-Dokument -> normalisierte Dokumentklasse.
//
// REIHENFOLGE — der Dokumenttyp ist IMMER spezifischer als die Dokumentart und gewinnt deshalb
// auf jeder Stufe zuerst:
//   1. <DokTyp*> gegen die Landestabelle      (belegt, laenderspezifisch)
//   2. <DokTyp*> gegen die amtliche Bezeichnung (nachrangig, ausgewiesen)
//   3. <DokArt*> gegen die Landestabelle
//   4. <DokArt*> gegen die amtliche Bezeichnung
//   5. sonst `unbekannt` — fail closed, nie geraten
// Der reale Berliner Record D-351603 (DokArtL "Plenarprotokoll", DokTypL "Antwort") zeigt, warum:
// ueber die Dokumentart allein waere eine Antwort still ein Sitzungsdokument.
// Rueckgabe traegt IMMER, woher die Klasse stammt (`quelle`) und worauf sie sich stuetzt (`beleg`).
function klassifiziereDokument(doc = {}) {
  const land = String(doc.land || "").toLowerCase();
  const tabellen = LAND_TABELLEN[land];
  const typK = schluessel(doc.dokumenttyp);
  const artK = schluessel(doc.dokumentart);

  if (!typK && !artK) {
    return { dokumentklasse: "unbekannt", klasse_quelle: "kein-typfeld", klasse_beleg: null, klasse_rohwert: null };
  }
  if (!tabellen) {
    // Unbekanntes Land -> nichts raten (der Parser laesst das ohnehin nicht zu; hier fail closed).
    return { dokumentklasse: "unbekannt", klasse_quelle: "unbekanntes-land", klasse_beleg: null, klasse_rohwert: typK || artK };
  }

  const kandidaten = [
    { key: typK, tabelle: tabellen.typen, quelle: "land-doktyp", roh: doc.dokumenttyp },
    { key: artK, tabelle: tabellen.arten, quelle: "land-dokart", roh: doc.dokumentart }
  ];
  for (const k of kandidaten) {
    if (!k.key) continue;
    const treffer = k.tabelle[k.key];
    if (treffer) {
      return { dokumentklasse: treffer.klasse, klasse_quelle: k.quelle, klasse_beleg: treffer.beleg, klasse_rohwert: k.roh };
    }
    const allgemein = ALLGEMEINE_BEZEICHNUNGEN[k.key];
    if (allgemein) {
      return { dokumentklasse: allgemein, klasse_quelle: "amtliche-bezeichnung", klasse_beleg: "amtliche-bezeichnung", klasse_rohwert: k.roh };
    }
  }
  // FAIL CLOSED: Typ vorhanden, aber nicht belegt zuzuordnen.
  return { dokumentklasse: "unbekannt", klasse_quelle: "nicht-zugeordnet", klasse_beleg: null, klasse_rohwert: doc.dokumenttyp || doc.dokumentart || null };
}

// --- Kanonischer Rohdokument-Vertrag ---------------------------------------------------------
function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }

// Anzeigebezeichnung fuer formatbedingt titellose Dokumente (Plenar-/Ausschussprotokoll, GVBl,
// Antwort). Zusammengesetzt AUSSCHLIESSLICH aus real vorhandenen Feldern — kein erfundener Titel.
// Das Ergebnis wird als `raw.titel_abgeleitet = true` gekennzeichnet, `raw.titel_original` bleibt null.
function abgeleiteteBezeichnung(doc = {}) {
  const teile = [
    doc.dokumenttyp || doc.dokumentart || null,
    doc.drucksachennummer || null,
    doc.veroeffentlichungsdatum || null
  ].filter(Boolean);
  if (teile.length) return teile.join(" · ");
  return String(doc.externe_id || "").trim() || null;
}

const LAND_HERKUNFT = Object.freeze({ berlin: "BLN", brandenburg: "BRA" });

// Ein geparstes PARDOK-Dokument -> Zeile im BESTEHENDEN Vertrag public.raw_documents.
// `kontext` traegt alles, was das Dokument selbst nicht weiss (Abrufweg, Herausgeber, Abrufzeit).
// Rein: keine Uhr, kein Zufall, kein Netz -> zweimal derselbe Aufruf = byte-identisches Ergebnis.
function zuRohdokument(doc = {}, kontext = {}) {
  const klass = doc.dokumentklasse
    ? { dokumentklasse: doc.dokumentklasse, klasse_quelle: doc.dokumentklasse_quelle || null, klasse_beleg: doc.dokumentklasse_beleg || null, klasse_rohwert: doc.dokumentklasse_rohwert || null }
    : klassifiziereDokument(doc);

  const fingerabdruck = doc.inhaltsfingerabdruck || null;
  const titelOriginal = doc.titel || null;
  const titel = titelOriginal || abgeleiteteBezeichnung(doc);
  const url = doc.originaladresse || null;

  return {
    // --- Identitaet (stabil, titelunabhaengig; content_hash traegt die Dedup-Identitaet) -------
    id: fingerabdruck ? `raw-${sha256(fingerabdruck).slice(0, 16)}` : null,
    content_hash: fingerabdruck,
    // Vorgangsbildung ist NICHT Aufgabe dieses Pfades -> cluster_id bleibt leer (Grundsatz 3).
    cluster_id: null,

    // --- Inhalt -------------------------------------------------------------------------------
    title: titel,
    summary: "",                       // nichts erfinden: der Export liefert keine Kurzfassung
    url: url || "",
    canonical_url: url,
    link_type: url ? "direct" : "missing",

    // --- Herausgeber / Abrufweg ---------------------------------------------------------------
    source_id: kontext.sourceId || null,
    source_name: kontext.sourceName || null,
    source_type: kontext.sourceType || "parliament",
    publisher_id: kontext.publisherId || null,
    confidence: "high",                // amtliche Primaerquelle (analog crawler.confidenceForSource)

    // --- Zeit ---------------------------------------------------------------------------------
    published_at: doc.veroeffentlichungsdatum || null,
    retrieved_at: kontext.abgerufenAm || null,   // injiziert, damit der Mapper rein bleibt

    // --- Typisierung (bestehende Spalten) -----------------------------------------------------
    // document_type traegt die AMTLICHE Bezeichnung (so erwartet es understanding-gate);
    // die normalisierte Klasse steht daneben in `raw`.
    document_type: doc.dokumenttyp || doc.dokumentart || null,
    wahlperiode: doc.wahlperiode == null ? null : String(doc.wahlperiode),

    // --- Alles Landesspezifische im bestehenden jsonb (keine neue Parallelstruktur) -----------
    raw: {
      herkunft: LAND_HERKUNFT[String(doc.land || "").toLowerCase()] || null,
      land: doc.land || null,
      politische_ebene: doc.politische_ebene || null,
      geografie: doc.geografie || null,
      externe_id: doc.externe_id || null,
      dokumentart: doc.dokumentart || null,
      dokumenttyp: doc.dokumenttyp || null,
      dokumentklasse: klass.dokumentklasse,
      dokumentklasse_quelle: klass.klasse_quelle,
      dokumentklasse_beleg: klass.klasse_beleg,
      drucksachennummer: doc.drucksachennummer || null,
      // Bezug, NICHT Vorgangsbildung: Berlin liefert ihn nachweislich nicht (VORGANGSBEZUG).
      vorgangsnummer: doc.vorgangsnummer || null,
      vorgangstyp: doc.vorgangstyp || null,
      ausschuss: doc.ausschuss || null,
      urheber: Array.isArray(doc.urheber) ? doc.urheber : null,
      stichworte: Array.isArray(doc.stichworte) ? doc.stichworte : null,
      titel_original: titelOriginal,
      titel_abgeleitet: !titelOriginal,
      abrufweg: kontext.abrufwegId || null,
      quelle_url: kontext.quelleUrl || null
    }
  };
}

module.exports = {
  DOKUMENTKLASSEN, KLASSEN_SET, BELEGE,
  BERLIN_TYPEN, BERLIN_ARTEN, BRANDENBURG_TYPEN, BRANDENBURG_ARTEN, ALLGEMEINE_BEZEICHNUNGEN,
  KLASSEN_AUSNAHMEN, VORGANGSBEZUG, LAND_TABELLEN,
  klassifiziereDokument, zuRohdokument, abgeleiteteBezeichnung
};
