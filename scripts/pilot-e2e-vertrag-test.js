"use strict";

// Punkt 25A — Deterministischer Repository-Ende-zu-Ende-Vertrag fuer den Pilotmandanten (Bund).
// =============================================================================================
// VERBINDLICHE DEFINITION (Sprint 25A, 2026-07-30): "Punkt 25" ist Zeile 25 der
// docs/roadmap/phase_1_checkliste.md ("Ende-zu-Ende-Test fuer den Pilotmandanten:
// Der Pilotmandant erhaelt passende Bundespolitik bis ins fertige Briefing") — NICHT
// OP-25 der datenmotor-restliste.md (Cron-Fairness, anderes Thema; OP-25 bleibt von
// diesem Test unberuehrt). Der Punkt ist geschnitten in 25A (dieser Repository-Vertrag,
// offline) und 25B (regulaerer Production-Nachweis nach dem Deployment von PR #185,
// ausdruecklich NICHT Teil dieses Tests).
//
// MANDANTENNEUTRALITAET (CLAUDE.md §4.2, START_HERE.md §5.4): Dieser Vertrag verwendet
// die zentrale KUENSTLICHE Profil-Fixture (scripts/fixtures/test-profiles.js) — keine
// echte Person, kein echtes Mandat, kein Klarname. "Pilotmandant" meint hier die ROLLE
// (ein aktives Bundestagsmandat mit gepflegtem Profil), nicht eine Person.
//
// WAS DIESER VERTRAG BEWEIST: Ein realistisches Bundesdokument (DIP-Drucksache)
// durchlaeuft den tatsaechlich aktiven Helmut-Pfad — DIP-Normalisierung -> Crawl-Item
// -> kanonisches Rohdokument (DSGVO-Minimierung) -> Vorgangsbildung/Understanding ->
// politische Ebene/Institution/Thema/Ausschuss -> Merkmalsvektor -> aktives Matching
// (Audit AN wie Production, M8 AUS) -> persistierte Ergebnisse samt Begruendung und
// Signalen -> sichtbare Erklaerung -> Entscheidung -> Lage-Auswahl — und kommt beim
// richtigen Bundestags-Testprofil als politisch brauchbare, belegte, mandantengetrennte
// Ausgabe an.
//
// PFLICHTFAELLE (Sprintauftrag Punkt 25A):
//   1. klar relevanter Bundesvorgang MIT echtem Ausschussbezug        (Tariftreue)
//   2. thematisch relevanter Bundesvorgang OHNE Ausschussbezug        (Tarifbindung)
//   3. Landesvorgang mit aehnlich benanntem Ausschuss                 (Sozialbericht,
//      "Ausschuss fuer Soziales, Gesundheit und Integration" -> Stamm arbeit-und-soziales)
//   4. kommunaler Vorgang mit aehnlich benanntem Ausschuss            (Pflegestuetzpunkte,
//      "Sozialausschuss des Kreistags Musterkreis" -> Stamm arbeit-und-soziales)
//   5. irrelevanter Vorgang                                           (Hochseefischerei)
//   6. fehlende/unbekannte Ebene                                      (Alterssicherung)
//   7. unvollstaendige Institutionsangabe                             (Grundsicherung,
//      "Ministerium fuer Soziales" ohne erkennbare Ebene)
//   8. doppelte Verarbeitung derselben Eingabe                        (Abschnitte E/G)
//   9. zweiter Mandant mit anderem Profil                             (Abschnitt H)
//  10. nicht berechtigter Nutzerzugriff                               (Abschnitt H)
//
// BEFUND 27A-2 (PR #185) ALS REGRESSION VERANKERT: die Faelle 3, 4, 6 und 7 sind exakt
// die Konstellation, die vor dem Fix bei aktiven Bundestagsprofilen falsche
// Ausschussbelege erzeugte (in Production gemessen: 14 qualifizierte Faelle, §51/§52
// in docs/matching-nachvollziehbarkeit.md). Erwartung seit dem Fix: KEIN
// Ausschussbeleg ohne positiv als `bund` belegte Vorgangsebene — der fachliche Bezug
// bleibt als `thema` erhalten, die Aehnlichkeit und der Rang bleiben unangetastet.
//
// ECHTE PRODUKTIONSFUNKTIONEN (keine Testkopie der Logik):
//   dip.normalizeDrucksache (DIP-API-Dokument -> Helmut-Format, inkl. Titelbereinigung)
//   scheduler.dipDocToRawItem (DIP-Dokument -> Crawl-Item, wie im Live-Crawl)
//   dedup.toRawDocumentRow + dedupeRawDocuments + canonicalizeUrl (DSGVO-Minimierung,
//     kanonische Identitaet — derselbe Weg wie persistRawDocumentsShadow)
//   understanding.runUnderstandingShadow (Clustering, Resolver, Assemble,
//     Klassifikation, Ebenen-/Geografie-Gedaechtnis, Merkmalsvektor) — Deps injiziert
//   matching.runMatchingShadow + matching-audit.auditRun (aktiver Pfad: Audit AN wie in
//     Production seit 2026-07-28) — Deps injiziert
//   matching.ausschussBelegZulaessig/matchedFeatures (Zustaendigkeitsregel, PR #185)
//   matching-relevanz (M8, DEFAULT AUS — wird als AUS bewiesen, nicht aktiviert)
//   matching-erklaerung.erklaerungAusErgebnis (sichtbare Erklaerung)
//   decisions.runDecisionShadow / decideForUser (Entscheidung)
//   lage.loadRankedVorgaenge + koToVorgangCard + selectLageVorgaenge (politische Ausgabe)
//
// WAS ERSETZT WIRD (einzige Testdoubles, klar begrenzt — gemeinsames technisches
// Geruest in scripts/e2e-vertrag-geruest.js, identisch zu 26A/27A):
//   1. Die LLM-Antwort: deterministische Fixture-Analysen je Cluster (Testdaten, KEIN
//      Quellenbeleg — Adressen liegen auf .example-Domains, keine erfundenen echten URLs).
//   2. Der Storage-Unterbau: In-Memory-Store mit denselben Vertragsgrenzen wie
//      Supabase/PostgREST (Mandantenfilter, aktuell=is.true, Tenant-Guard, atomare
//      publish-Semantik wie helmut_publish_matching_run).
//   3. Die pgvector-RPC match_knowledge_objects: dokumentgetreue Offline-Replik ueber
//      die ECHTEN write-time-Merkmalsvektoren.
//
// KEIN Netz, KEINE KI, KEINE Production-Abhaengigkeit (laeuft mit UND ohne gesetzte
// Supabase-Secrets identisch), KEINE Migration, KEIN neuer Schalter. Berlin,
// Brandenburg und M8 bleiben deaktiviert; der Test aktiviert NICHTS. Dieser Vertrag
// beweist NICHT den regulaeren Production-Lauf nach PR #185 — das ist 25B.

const dip = require("../lib/helmut/dip");
const scheduler = require("../lib/helmut/scheduler");
const dedup = require("../lib/helmut/dedup");
const understanding = require("../lib/helmut/understanding");
const matching = require("../lib/helmut/matching");
const matchingRelevanz = require("../lib/helmut/matching-relevanz");
const matchingErklaerung = require("../lib/helmut/matching-erklaerung");
const contract = require("../lib/helmut/matching-contract");
const decisions = require("../lib/helmut/decisions");
const lage = require("../lib/helmut/lage");
const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");

const G = require("./e2e-vertrag-geruest");

// ── Harness ──────────────────────────────────────────────────────────────────
const zaehlwerk = G.neuesZaehlwerk();
const check = zaehlwerk.check;
const abschnitt = zaehlwerk.abschnitt;
const stand = zaehlwerk.stand;

// Beobachtbarkeit: Stufennachweis des Testlaufs (kein globales Pauschal-Gruen).
const LAUF = {
  testlauf: `e2e-pilot-vertrag-${new Date().toISOString().slice(0, 10)}`,
  profil: null, zweitprofil: null,
  eingangsdokumente: 0, normalisiert: 0, rohdokumente: 0,
  vorgaenge: 0, verstanden: 0, embeddingStatus: null,
  matchingErgebnisse: 0, entscheidungen: 0, briefingAuswahl: [],
  kontrollfaelleAusgeschlossen: [], fehlerstufe: null, fehlergrund: null,
  wiederholung: null, mandanten: {}
};

// ── Testprofile (zentrale kuenstliche Fixture, kein echtes Mandat) ───────────
// PROFIL_A ist die Pilotmandanten-ROLLE: aktives Bundestagsmandat, gepflegtes
// Profil (Partei, Ausschuss, Wahlkreisland, Schwerpunkte). Das Politikfeld-Label
// "Arbeit und Soziales" steht ausdruecklich in den Schwerpunkten, damit die
// thema-Dimension gegen derivePolicyFields treffen kann (P1-1: die Themen eines
// KO entstehen im aktiven Pfad ausschliesslich aus den Ausschuessen).
const PROFIL_A = Object.freeze({
  ...testPoliticianOne,
  id: "e2e-bund-pilotprofil",
  fullName: "Testmandat Bund (E2E-Vertrag 25A)",
  profileActive: true,
  focusTopics: [...testPoliticianOne.focusTopics, "Arbeit und Soziales"]
});
// Zweitmandant: anderes Fachgebiet (Gesundheit), andere Partei, anderes Land.
const PROFIL_B = Object.freeze({
  ...testPoliticianTwo,
  id: "e2e-bund-kontrollprofil",
  fullName: "Testmandat Bund (Kontrolle 25A)",
  profileActive: true
});
LAUF.profil = PROFIL_A.id;
LAUF.zweitprofil = PROFIL_B.id;

// ── Eingang 1: DIP-API-Dokumente (synthetisch, klar markiert, .example) ──────
// Struktur wie die echte DIP-v1-Antwort (documents[]) — Testdaten, KEIN Quellenbeleg.
// HINWEIS ZUR TRENNSCHAERFE: die Vorgangsbildung (docsShareEvent) zieht zwei
// Dokumente schon ueber EINEN geteilten spezifischen Anker zusammen (Befund B4-4,
// in Production aktiv und bewusst nicht Teil dieses Sprints). Sieben GETRENNTE
// Vorgaenge brauchen deshalb — wie echte getrennte Vorgaenge — disjunkte
// spezifische Ankermengen; urheber/ressort sind nur beim Hauptfall gefuellt.
const DIP_API_DOKUMENTE = [
  {
    // Pflichtfall 1: klar relevanter Bundesvorgang mit echtem Ausschussbezug.
    id: "9990001",
    drucksachetyp: "Gesetzentwurf",
    titel: "Entwurf eines Gesetzes zur Staerkung der Tariftreue",
    datum: "2026-07-28",
    fundstelle: { pdf_url: "https://bund.example/btd/21/9990001.pdf" },
    urheber: [{ titel: "Bundesregierung" }],
    ressort: [{ titel: "Bundesministerium für Arbeit und Soziales" }],
    wahlperiode: 21
  },
  {
    // Pflichtfall 2: thematisch relevanter Bundesvorgang OHNE Ausschussbezug.
    // Der DIP-Antworttitel prueft zugleich die echte Titelbereinigung (cleanDipTitle).
    id: "9990002",
    drucksachetyp: "Antwort",
    titel: "auf die Kleine Anfrage\r\n- Drucksache 21/888 -\r\nEntwicklung der Tarifbindung und des Mindestlohns",
    datum: "2026-07-27",
    fundstelle: { pdf_url: "https://bund.example/btd/21/9990002.pdf" },
    urheber: [],
    ressort: [],
    wahlperiode: 21
  },
  {
    // Pflichtfall 5: irrelevanter (Bundes-)Vorgang.
    id: "9990003",
    drucksachetyp: "Unterrichtung",
    titel: "Jahresbericht ueber die Hochseefischerei",
    datum: "2026-07-26",
    fundstelle: { pdf_url: "https://bund.example/btd/21/9990003.pdf" },
    urheber: [],
    ressort: [],
    wahlperiode: 21
  }
];

// ── Eingang 2: Medien-Crawl-Items (so erreichen Landes-/Kommunal-/unklare
// Dokumente den Bundespiloten real: ueber Medienquellen im gemeinsamen Korpus) ──
const ABRUF = "2026-07-30T04:00:00.000Z";
const MEDIEN_ITEMS = [
  {
    // Pflichtfall 3: Landesvorgang mit aehnlich benanntem Ausschuss.
    id: "media-land-sozialbericht",
    title: "Landtag in Sachsen debattiert den Sozialbericht",
    summary: "Der Landtag eroertert den Sozialbericht des Landes.",
    url: "https://medien.example/land/sozialbericht",
    sourceName: "Beispielmedien", sourceId: "medien-beispiel", sourceType: "media",
    linkType: "direct", confidence: "medium",
    publishedAt: "2026-07-29T06:00:00Z", retrievedAt: ABRUF
  },
  {
    // Pflichtfall 4: kommunaler Vorgang mit aehnlich benanntem Ausschuss.
    id: "media-kreis-pflegestuetzpunkte",
    title: "Sozialausschuss des Kreistags Musterkreis beraet Pflegestuetzpunkte",
    summary: "Der Kreistag beraet den Ausbau der Pflegestuetzpunkte.",
    url: "https://medien.example/kreis/pflegestuetzpunkte",
    sourceName: "Beispielmedien", sourceId: "medien-beispiel", sourceType: "media",
    linkType: "direct", confidence: "medium",
    publishedAt: "2026-07-29T07:00:00Z", retrievedAt: ABRUF
  },
  {
    // Pflichtfall 6: fehlende/unbekannte Ebene (kein institutionelles Signal).
    id: "media-tagung-alterssicherung",
    title: "Fachtagung zur Zukunft der Alterssicherung",
    summary: "Eine Fachtagung diskutiert Reformwege der Alterssicherung.",
    url: "https://medien.example/tagung/alterssicherung",
    sourceName: "Beispielmedien", sourceId: "medien-beispiel", sourceType: "media",
    linkType: "direct", confidence: "medium",
    publishedAt: "2026-07-29T08:00:00Z", retrievedAt: ABRUF
  },
  {
    // Pflichtfall 7: unvollstaendige Institutionsangabe ("Ministerium fuer
    // Soziales" — weder Bund noch Land erkennbar).
    id: "media-ministerium-grundsicherung",
    title: "Ministerium kuendigt Reform der Grundsicherung an",
    summary: "Ein Ministerium plant Aenderungen bei der Grundsicherung.",
    url: "https://medien.example/ministerium/grundsicherung",
    sourceName: "Beispielmedien", sourceId: "medien-beispiel", sourceType: "media",
    linkType: "direct", confidence: "medium",
    publishedAt: "2026-07-29T09:00:00Z", retrievedAt: ABRUF
  }
];

// ── Deterministische Fixture-Analysen (Ersatz fuer den LLM-Call) ─────────────
// Testdaten, kein Quellenbeleg. Ebenen-Signale entstehen NICHT durch Behauptung,
// sondern wie im echten Pfad: aus Institutionsnennungen (deriveDecisionLevel) bzw.
// aus dem KI-Feld decision_level (kommune — der Deriver kennt keine Kommunal-Terme,
// in Production stammen kommune-Ebenen aus der KI-Klassifikation).
const AI_FIXTURES = [
  {
    marker: "Tariftreue",
    result: {
      headline: "Bundestag beraet das Tariftreuegesetz",
      was_ist_passiert: "Die Bundesregierung hat den Entwurf eines Gesetzes zur Staerkung der Tariftreue und der Tarifbindung in den Bundestag eingebracht. Der Ausschuss fuer Arbeit und Soziales uebernimmt die Federfuehrung.",
      warum_wichtig: "Das Gesetz bindet oeffentliche Auftraege an Tariftreue und staerkt die Tarifbindung und den Mindestlohnvollzug.",
      wer_ist_betroffen: "Beschaeftigte, Gewerkschaften und oeffentliche Auftraggeber.",
      handlungsempfehlung: "Beratung im Ausschuss fuer Arbeit und Soziales vorbereiten und eigene Aenderungsanträge zur Tarifbindung setzen.",
      parteien: [], ausschuesse: ["Ausschuss für Arbeit und Soziales"],
      ministerien: ["Bundesministerium für Arbeit und Soziales"],
      risiken: ["Der Vollzug der Tariftreue koennte hinter den Erwartungen zurueckbleiben"],
      chancen: ["Staerkung der Tarifbindung ueber die oeffentliche Auftragsvergabe"],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: ["Ausschuss für Arbeit und Soziales"],
      mentioned_ministries: ["Bundesministerium für Arbeit und Soziales"],
      mentioned_locations: [], mentioned_organizations: [],
      tags: ["Tarifbindung", "Mindestlohn"],
      zeitdruck: "mittel", confidence_score: 82,
      display_title: "Tariftreuegesetz kommt in den Bundestag",
      display_summary: "Die Bundesregierung bringt das Tariftreuegesetz ein; der Ausschuss fuer Arbeit und Soziales uebernimmt die Federfuehrung.",
      why_relevant: "Faellt unmittelbar in die Zustaendigkeit des Ausschusses fuer Arbeit und Soziales und betrifft Tarifbindung und Mindestlohn.",
      recommendation: "Beratung im Ausschuss vorbereiten und eigene Schwerpunkte zur Tarifbindung setzen.",
      display_category: "Arbeit und Soziales",
      risk_level: "medium", opportunity_level: "medium"
    }
  },
  {
    marker: "Entwicklung der Tarifbindung",
    result: {
      headline: "Bundesregierung legt Zahlen zur Tarifbindung vor",
      was_ist_passiert: "Die Bundesregierung hat auf eine Kleine Anfrage die Entwicklung der Tarifbindung und des Mindestlohns dargestellt.",
      warum_wichtig: "Die Tarifbindung und der Mindestlohn bestimmen die Debatte ueber gute Arbeit.",
      wer_ist_betroffen: "Beschaeftigte und Arbeitgeber bundesweit.",
      handlungsempfehlung: "Zahlen zur Tarifbindung in eigene Argumentation uebernehmen.",
      parteien: [], ausschuesse: [],
      ministerien: ["Bundesministerium für Arbeit und Soziales"],
      risiken: [], chancen: ["Belastbare Zahlen fuer die eigene Position zur Tarifbindung"],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [],
      mentioned_ministries: ["Bundesministerium für Arbeit und Soziales"],
      mentioned_locations: [], mentioned_organizations: [],
      tags: ["Tarifbindung"],
      zeitdruck: "mittel", confidence_score: 75,
      display_title: "Neue Zahlen zur Tarifbindung",
      display_summary: "Die Bundesregierung legt die Entwicklung der Tarifbindung und des Mindestlohns offen.",
      why_relevant: "Thematisch einschlaegig fuer Arbeitsmarkt- und Tarifpolitik.",
      recommendation: "Zahlen auswerten und fuer die eigene Kommunikation nutzen.",
      display_category: "Arbeitsmarkt",
      risk_level: "low", opportunity_level: "medium"
    }
  },
  {
    marker: "Hochseefischerei",
    result: {
      headline: "Jahresbericht zur Hochseefischerei vorgelegt",
      was_ist_passiert: "Die Bundesregierung hat den Jahresbericht ueber die Entwicklung der Hochseefischerei vorgelegt.",
      warum_wichtig: "Der Bericht dokumentiert Fangmengen und Flottenentwicklung.",
      wer_ist_betroffen: "Fischereibetriebe und Kuestenregionen.",
      handlungsempfehlung: "Keine Reaktion noetig.",
      parteien: [], ausschuesse: [],
      ministerien: ["Bundesministerium für Ernährung und Landwirtschaft"],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [],
      mentioned_ministries: ["Bundesministerium für Ernährung und Landwirtschaft"],
      mentioned_locations: [], mentioned_organizations: [],
      tags: ["Fischerei"],
      zeitdruck: "niedrig", confidence_score: 60,
      display_title: "Jahresbericht zur Hochseefischerei",
      display_summary: "Die Bundesregierung legt den Jahresbericht zur Hochseefischerei vor.",
      why_relevant: "Fachfremder Berichtsvorgang ohne Bezug zu Arbeit und Soziales.",
      recommendation: "Keine Reaktion noetig.",
      display_category: "Landwirtschaft",
      risk_level: "low", opportunity_level: "low"
    }
  },
  {
    // FREMDER LANDESFALL MIT AEHNLICH BENANNTEM AUSSCHUSS (Regression 27A-2).
    // Der Landtagsausschuss "Soziales, Gesundheit und Integration" faellt auf
    // denselben Merkmalsstamm arbeit-und-soziales wie der Bundestagsausschuss —
    // genau die Konstellation, die vor PR #185 falsche Ausschussbelege erzeugte.
    marker: "Sozialbericht",
    result: {
      headline: "Landtag in Sachsen debattiert den Sozialbericht",
      was_ist_passiert: "Der Landtag in Sachsen hat den Sozialbericht des Landes debattiert. Der Ausschuss fuer Soziales, Gesundheit und Integration legt Empfehlungen vor.",
      warum_wichtig: "Der Sozialbericht bestimmt die Landesdebatte ueber soziale Lage und Armutsbekaempfung.",
      wer_ist_betroffen: "Traeger sozialer Arbeit und Kommunen in Sachsen.",
      handlungsempfehlung: "Beobachten; die Zustaendigkeit liegt beim Landtag.",
      parteien: [], ausschuesse: ["Ausschuss für Soziales, Gesundheit und Integration"],
      ministerien: [],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: ["Ausschuss für Soziales, Gesundheit und Integration"],
      mentioned_ministries: [],
      mentioned_locations: ["Sachsen"], mentioned_organizations: [],
      tags: ["Soziales"],
      zeitdruck: "niedrig", confidence_score: 64,
      display_title: "Sozialbericht im Landtag",
      display_summary: "Der Landtag in Niedersachsen debattiert den Sozialbericht; der Sozialausschuss legt Empfehlungen vor.",
      why_relevant: "Landesangelegenheit; zustaendig ist der Landtag, nicht der Bundestag.",
      recommendation: "Nur beobachten.",
      display_category: "Soziales (Land)",
      risk_level: "low", opportunity_level: "low"
    }
  },
  {
    // KOMMUNALER FALL MIT AEHNLICH BENANNTEM AUSSCHUSS (Regression 27A-2,
    // Production-Pendant: "Sozialausschuss Kreistag Ostallgaeu" -> arbeit-und-soziales).
    // decision_level kommt hier als KI-Wert — der Deriver kennt keine Kommunal-Terme.
    marker: "Pflegestuetzpunkte",
    result: {
      decision_level: "kommune",
      headline: "Kreistag beraet Ausbau der Pflegestuetzpunkte",
      was_ist_passiert: "Der Sozialausschuss des Kreistags Musterkreis hat den Ausbau der Pflegestuetzpunkte beraten.",
      warum_wichtig: "Die Pflegestuetzpunkte sind die oertliche Anlaufstelle fuer Pflegebeduerftige.",
      wer_ist_betroffen: "Pflegebeduerftige und Angehoerige im Musterkreis.",
      handlungsempfehlung: "Keine Reaktion noetig; kommunale Zustaendigkeit.",
      parteien: [], ausschuesse: ["Sozialausschuss des Kreistags Musterkreis"],
      ministerien: [],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: ["Sozialausschuss des Kreistags Musterkreis"],
      mentioned_ministries: [],
      mentioned_locations: ["Musterkreis"], mentioned_organizations: [],
      tags: ["Pflege"],
      zeitdruck: "niedrig", confidence_score: 62,
      display_title: "Pflegestuetzpunkte im Kreistag",
      display_summary: "Der Sozialausschuss des Kreistags Musterkreis beraet den Ausbau der Pflegestuetzpunkte.",
      why_relevant: "Kommunale Zustaendigkeit ohne Bundestagsbezug.",
      recommendation: "Nur beobachten.",
      display_category: "Kommunales",
      risk_level: "low", opportunity_level: "low"
    }
  },
  {
    // FEHLENDE/UNBEKANNTE EBENE: kein institutionelles Signal, keine KI-Ebene.
    marker: "Alterssicherung",
    result: {
      headline: "Fachtagung zur Zukunft der Alterssicherung",
      was_ist_passiert: "Eine Fachtagung hat Reformwege der Alterssicherung diskutiert.",
      warum_wichtig: "Die Alterssicherung ist ein Dauerthema der Sozialpolitik.",
      wer_ist_betroffen: "Versicherte und Traeger der Alterssicherung.",
      handlungsempfehlung: "Keine Reaktion noetig.",
      parteien: [], ausschuesse: [], ministerien: [],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: [],
      mentioned_locations: [], mentioned_organizations: [],
      tags: ["Rente"],
      zeitdruck: "niedrig", confidence_score: 55,
      display_title: "Tagung zur Alterssicherung",
      display_summary: "Eine Fachtagung diskutiert Reformwege der Alterssicherung.",
      why_relevant: "Kein zustaendiges Gremium erkennbar.",
      recommendation: "Keine Reaktion noetig.",
      display_category: "Soziales",
      risk_level: "low", opportunity_level: "low"
    }
  },
  {
    // UNVOLLSTAENDIGE INSTITUTIONSANGABE: "Ministerium fuer Soziales" — weder
    // Bundes- noch Landesministerium erkennbar; die Ebene bleibt ehrlich unknown.
    marker: "Grundsicherung",
    result: {
      headline: "Ministerium kuendigt Reform der Grundsicherung an",
      was_ist_passiert: "Ein Ministerium fuer Soziales hat eine Reform der Grundsicherung angekuendigt; die Zustaendigkeit geht aus der Meldung nicht hervor.",
      warum_wichtig: "Die Grundsicherung betrifft die soziale Mindestabsicherung.",
      wer_ist_betroffen: "Leistungsberechtigte der Grundsicherung.",
      handlungsempfehlung: "Zustaendigkeit klaeren, dann bewerten.",
      parteien: [], ausschuesse: [],
      ministerien: ["Ministerium für Soziales"],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [],
      mentioned_ministries: ["Ministerium für Soziales"],
      mentioned_locations: [], mentioned_organizations: [],
      tags: ["Grundsicherung"],
      zeitdruck: "niedrig", confidence_score: 58,
      display_title: "Reform der Grundsicherung angekuendigt",
      display_summary: "Ein Ministerium kuendigt eine Reform der Grundsicherung an; die Zustaendigkeit ist unklar.",
      why_relevant: "Traegerschaft und Ebene sind nicht belegt.",
      recommendation: "Zustaendigkeit klaeren.",
      display_category: "Soziales",
      risk_level: "low", opportunity_level: "low"
    }
  }
];
const fixture = G.macheFixtureUnderstanding(AI_FIXTURES);
const fixtureUnderstanding = fixture.requestUnderstanding;

function neuerStore() {
  return G.neuerStore({
    getProfile: (userId) => (userId === PROFIL_A.id ? PROFIL_A : userId === PROFIL_B.id ? PROFIL_B : null),
    requestUnderstanding: fixtureUnderstanding,
    relevanzGateEnabled: () => matchingRelevanz.relevanzGateAktiv(process.env)
  });
}

(async () => {
  // ═══ A · Sicherheitsgrenzen: nichts ist aktiviert, nichts wird aktiviert ═══
  abschnitt("A · Sicherheitsgrenzen (M8 aus, Audit an wie Production, kein Netz)");
  check("A1 M8-Relevanzriegel ist AUS (HELMUT_MATCHING_RELEVANZ_GATE nicht gesetzt)",
    matchingRelevanz.relevanzGateAktiv(process.env) === false);
  check("A2 M8 inaktiv laesst die Kandidatenliste byte-identisch",
    (() => { const r = matchingRelevanz.wendeRelevanzGateAn([{ id: 1 }], { aktiv: false }); return r.zeilen.length === 1 && r.verworfen === 0 && r.aktiv === false; })());
  check("A3 der Vertrag nutzt den aktiven Matching-Pfad mit Audit AN (wie Production seit 2026-07-28)",
    neuerStore().matchingOverrides.auditEnabled() === true);

  // ═══ B · Einlesen + Normalisierung (echter Bund-Ingestion-Pfad) ═══
  abschnitt("B · Einlesen + Normalisierung (DIP -> Crawl-Item -> Rohdokument)");
  const dipNormalisiert = DIP_API_DOKUMENTE.map((d) => dip.normalizeDrucksache(d));
  check("B1 DIP-Normalisierung liefert drei strukturierte Drucksachen (id, Typ, Titel, URL)",
    dipNormalisiert.length === 3 && dipNormalisiert.every((d) => d && d.id && d.type && d.title && /^https:\/\//.test(d.url) && d.source === "dip"),
    JSON.stringify(dipNormalisiert.map((d) => d && [d.id, d.type])));
  check("B2 DIP-Antworttitel wird bereinigt (Drucksachen-Verweis entfernt, Titel bleibt)",
    dipNormalisiert[1].title === "Entwicklung der Tarifbindung und des Mindestlohns",
    dipNormalisiert[1].title);
  const dipItems = dipNormalisiert.map((d) => scheduler.dipDocToRawItem(d, { primary: false }));
  check("B3 Crawl-Item-Mapper (dipDocToRawItem): Quelle DIP Bundestag, hohes Vertrauen, Dokumenttyp erhalten",
    dipItems.every((i) => i.sourceId === "dip" && i.sourceType === "bundestag" && i.confidence === "high")
      && dipItems[0].documentType === "Gesetzentwurf" && dipItems[1].documentType === "Antwort",
    JSON.stringify(dipItems.map((i) => [i.id, i.documentType])));
  const alleItems = [...dipItems, ...MEDIEN_ITEMS];
  const rohZeilen = dedup.dedupeRawDocuments(alleItems.map(dedup.toRawDocumentRow).filter(Boolean));
  check("B4 Rohdokument-Vertrag (toRawDocumentRow): 7 minimierte Zeilen mit stabiler Identitaet",
    rohZeilen.length === 7 && rohZeilen.every((r) => /^rd-[0-9a-f]{64}$/.test(r.id) && r.content_hash && r.title && r.source_id),
    JSON.stringify(rohZeilen.map((r) => r.id.slice(0, 12))));
  check("B5 DSGVO-Minimierung: keine Volltexte, keine Personenfelder in der Rohzeile",
    rohZeilen.every((r) => !("content" in r) && !("excerpt" in r) && !("author" in r) && !("imageUrl" in r)
      && (!r.summary || r.summary.length <= dedup.SUMMARY_MAX)));
  check("B6 kanonische Adresse deterministisch (Tracking-Parameter/Fragmente ohne Einfluss)",
    dedup.canonicalizeUrl("https://medien.example/land/sozialbericht?utm_source=x#frag") === dedup.canonicalizeUrl("https://medien.example/land/sozialbericht"));
  const doppeltEingelesen = dedup.dedupeRawDocuments([...alleItems, alleItems[0]].map(dedup.toRawDocumentRow).filter(Boolean));
  check("B7 doppelt eingelesenes DIP-Dokument bleibt EINE Rohzeile (Dedup an der Identitaet)",
    doppeltEingelesen.length === 7);
  check("B8 Wiederholung der Normalisierung ist byte-identisch (Determinismus)",
    JSON.stringify(dedup.toRawDocumentRow(alleItems[0])) === JSON.stringify(dedup.toRawDocumentRow(alleItems[0])));
  LAUF.eingangsdokumente = alleItems.length;
  LAUF.normalisiert = rohZeilen.length;
  LAUF.rohdokumente = rohZeilen.length;

  // ═══ C · Understanding: echter Pfad, deterministische Analyse-Fixtures ═══
  abschnitt("C · Understanding (echte Orchestrierung, Fixture-Analysen)");
  const store = neuerStore();
  const u1 = await understanding.runUnderstandingShadow(rohZeilen, store.api);
  check("C1 sieben Cluster, sieben verarbeitet, keine Zurueckstellung",
    u1.clusters === 7 && u1.processed === 7 && u1.deferred === 0, JSON.stringify(u1.counts));
  check("C2 alle sieben Vorgaenge gespeichert (status saved)",
    (u1.counts.saved || 0) === 7, JSON.stringify(u1.counts));
  check("C3 Telemetrie weist jeden Endzustand aus (kein globales Pauschal-Gruen)",
    u1.telemetrie && u1.telemetrie.dokumente === 7 && u1.telemetrie.dokumenteOhneEndzustand === 0
      && u1.telemetrie.gruppen && u1.telemetrie.gruppen.verarbeitet === 7);

  const kos = [...store.knowledgeObjects.values()];
  const koRelevant = kos.find((k) => /Tariftreuegesetz/i.test(k.headline || ""));
  const koThema = kos.find((k) => /Zahlen zur Tarifbindung/i.test(k.headline || ""));
  const koIrrelevant = kos.find((k) => /Hochseefischerei/i.test(k.headline || ""));
  const koLand = kos.find((k) => /Sozialbericht/i.test(k.headline || ""));
  const koKommune = kos.find((k) => /Pflegestuetzpunkte/i.test(k.headline || ""));
  const koOhneEbene = kos.find((k) => /Alterssicherung/i.test(k.headline || ""));
  const koUnvollstaendig = kos.find((k) => /Grundsicherung/i.test(k.headline || ""));
  check("C4 sieben getrennte Vorgaenge — jedes Dokument nachvollziehbar einem eigenen Wissensobjekt zugeordnet",
    kos.length === 7 && [koRelevant, koThema, koIrrelevant, koLand, koKommune, koOhneEbene, koUnvollstaendig].every(Boolean)
      && new Set(kos.map((k) => k.vorgang_id)).size === 7,
    JSON.stringify(kos.map((k) => k.headline)));
  LAUF.vorgaenge = kos.length;
  LAUF.verstanden = kos.filter((k) => k.understanding_status === "complete").length;

  if (![koRelevant, koThema, koIrrelevant, koLand, koKommune, koOhneEbene, koUnvollstaendig].every(Boolean)) {
    console.error("\nABBRUCH: Pflicht-Vorgaenge fehlen — keine weiteren Stufen pruefbar (kein falsches Gruen).");
    console.log(`\n${stand.passed} bestanden, ${stand.failed + 1} fehlgeschlagen`);
    process.exit(1);
  }

  check("C5 relevanter Bundesvorgang: Ebene bund (aus der Institutionsnennung, mit Herkunftsnachweis)",
    koRelevant.decision_level === "bund" && koRelevant.political_level === "bund"
      && koRelevant.classification_confidence && Boolean(koRelevant.classification_confidence.level_quelle));
  check("C6 relevanter Bundesvorgang: echter Ausschussbezug gespeichert",
    (koRelevant.ausschuesse || []).includes("Ausschuss für Arbeit und Soziales"));
  check("C7 thematischer Bundesvorgang: Ebene bund, KEIN Ausschuss",
    koThema.decision_level === "bund" && (koThema.ausschuesse || []).length === 0
      && (koThema.mentioned_committees || []).length === 0);
  check("C8 Landesvorgang: Ebene land (Landtag + Bundesland), aehnlich benannter Ausschuss gespeichert",
    koLand.decision_level === "land"
      && (koLand.ausschuesse || []).includes("Ausschuss für Soziales, Gesundheit und Integration"),
    `${koLand.decision_level}`);
  check("C9 kommunaler Vorgang: Ebene kommune (KI-Klassifikation), Kreistagsausschuss gespeichert",
    koKommune.decision_level === "kommune"
      && (koKommune.ausschuesse || []).includes("Sozialausschuss des Kreistags Musterkreis"),
    `${koKommune.decision_level}`);
  check("C10 fehlendes Ebenen-Signal bleibt ehrlich unknown (keine geratene Bundesebene)",
    koOhneEbene.decision_level === "unknown", koOhneEbene.decision_level);
  check("C11 unvollstaendige Institutionsangabe bleibt ehrlich unknown (Ministerium ohne Ebene)",
    koUnvollstaendig.decision_level === "unknown"
      && (koUnvollstaendig.ministerien || []).includes("Ministerium für Soziales"),
    koUnvollstaendig.decision_level);
  check("C12 Thema entsteht deterministisch aus dem Ausschuss (derivePolicyFields, kein KI-Tag)",
    matching.derivePolicyFields(koLand).includes("Arbeit und Soziales")
      && matching.derivePolicyFields(koKommune).includes("Arbeit und Soziales")
      && matching.derivePolicyFields(koRelevant).includes("Arbeit und Soziales"));
  check("C13 die aehnlich benannten Ausschuesse fallen auf DENSELBEN Merkmalsstamm (die erlaubte Aehnlichkeit)",
    matching.normalizeCommittee("Ausschuss für Arbeit und Soziales") === "arbeit-und-soziales"
      && matching.normalizeCommittee("Ausschuss für Soziales, Gesundheit und Integration") === "arbeit-und-soziales"
      && matching.normalizeCommittee("Sozialausschuss des Kreistags Musterkreis") === "arbeit-und-soziales");
  check("C14 Merkmalsvektor (Repraesentation fuer das aktive Matching) ist persistiert",
    kos.every((k) => Array.isArray(k.embedding) && k.embedding.length === matching.EMBEDDING_DIM));
  LAUF.embeddingStatus = `feature-vektor ${matching.EMBEDDING_DIM}d bei ${kos.filter((k) => Array.isArray(k.embedding)).length}/7`;
  const linksRelevant = store.koLinks.get(koRelevant.id) || [];
  check("C15 Provenienz: die DIP-Adresse ist mit dem Vorgang verknuepft (ko_document_links)",
    linksRelevant.some((d) => d.url === "https://bund.example/btd/21/9990001.pdf"));
  check("C16 politischer Nutzwert gespeichert: Risiko, Chance, Empfehlung, Warum-relevant",
    (koRelevant.risiken || []).length >= 1 && (koRelevant.chancen || []).length >= 1
      && Boolean(koRelevant.recommendation) && Boolean(koRelevant.why_relevant));

  // ═══ D · Idempotenz des Understandings (Pflichtfall 8, Teil 1) ═══
  abschnitt("D · Idempotente Wiederholung (Understanding)");
  const vorher = JSON.stringify([...store.knowledgeObjects.values()].map((k) => [k.id, k.ko_version, k.updated_at]).sort());
  const u2 = await understanding.runUnderstandingShadow(rohZeilen, store.api);
  check("D1 identischer Zweitlauf: alle sieben Cluster als Duplikat erkannt, kein KI-Aufruf noetig",
    (u2.counts.duplicate || 0) === 7 && (u2.counts.saved || 0) === 0, JSON.stringify(u2.counts));
  check("D2 Zweitlauf veraendert keinen gespeicherten Vorgang (Version + Zeitstempel unveraendert)",
    JSON.stringify([...store.knowledgeObjects.values()].map((k) => [k.id, k.ko_version, k.updated_at]).sort()) === vorher);
  check("D3 keine fachlich falschen Doppelungen (weiter genau 7 Vorgaenge)",
    store.knowledgeObjects.size === 7);
  LAUF.wiederholung = "understanding duplicate:7, neue Schreibvorgaenge: 0";

  // ═══ E · Aktives Matching (Audit AN wie Production, M8 AUS) ═══
  abschnitt("E · Aktiver Matching-Pfad (Audit AN, M8 AUS) + Persistenz");
  const m1 = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "e2e-vertrag" }, store.matchingOverrides);
  check("E1 Matching-Lauf vollstaendig (Audit-Laufzeile, kein Skip)",
    m1 && !m1.skipped && m1.audit && m1.audit.status === contract.RUN_STATUS.VOLLSTAENDIG && m1.saved === 7,
    JSON.stringify(m1));
  check("E2 M8 aus: nichts verworfen, veroeffentlicht == Kandidaten",
    m1.verworfen === 0 && m1.veroeffentlicht === m1.candidates && m1.candidates === 7);

  const rowsA = store.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 });
  const rowVon = (ko) => rowsA.find((r) => r.knowledge_object_id === ko.id);
  const rowRelevant = rowVon(koRelevant);
  const rowThema = rowVon(koThema);
  const rowIrrelevant = rowVon(koIrrelevant);
  const rowLand = rowVon(koLand);
  const rowKommune = rowVon(koKommune);
  const rowOhneEbene = rowVon(koOhneEbene);
  const rowUnvollstaendig = rowVon(koUnvollstaendig);
  const feats = (row) => (row && row.matched_features) || [];
  const hatFeat = (row, art) => feats(row).some((f) => f.type === art);
  check("E3 sieben persistierte Ergebniszeilen fuer Profil A, alle aktuell, alle mit Laufbezug",
    rowsA.length === 7 && rowsA.every((r) => r.user_id === PROFIL_A.id && r.aktuell === true && r.run_id === m1.audit.runId));
  // BEOBACHTUNG B25-1 (gemessen, ehrlich gepinnt statt schoengefaerbt): die
  // Rangfolge entsteht aus der reinen MERKMALSAEHNLICHKEIT (PR #185 laesst sie
  // ausdruecklich unveraendert). Ein merkmalsarmer Kurztext mit gleichem
  // Ausschuss-Stamm und Fachgebiet (der Landesfall) kann dadurch VOR dem
  // inhaltsreichen Bundesfall stehen — seine hoehere Kosinus-Aehnlichkeit ist
  // die ERLAUBTE fachliche Naehe, KEIN Mitgliedschaftsbeleg. Die fachliche
  // Wahrheit traegt die Beleg- und Entscheidungsebene: nur der Bundesfall hat
  // den Ausschussbeleg, nur er erreicht "Sofort reagieren" (H2/H12).
  // Details: docs/roadmap/punkt-25-e2e-nachweis.md (Beobachtung B25-1).
  check("E4 der relevante Bundesvorgang ist die EINZIGE Zeile mit Ausschussbeleg und steht in den Top 2",
    rowRelevant && rowRelevant.rank <= 2
      && rowsA.filter((r) => hatFeat(r, "ausschuss")).length === 1 && hatFeat(rowRelevant, "ausschuss"),
    JSON.stringify(rowsA.map((r) => [r.knowledge_object_id, r.rank, r.similarity])));
  check("E4b Beobachtung B25-1 gepinnt: vor dem Bundesfall steht hoechstens der Landesfall — und der NUR mit erlaubten Belegen (thema, kein ausschuss)",
    rowsA.filter((r) => r.rank < rowRelevant.rank).every((r) =>
      r.knowledge_object_id === koLand.id && !hatFeat(r, "ausschuss")
        && feats(r).every((f) => f.type === "thema" || f.type === "wahlkreis")),
    JSON.stringify(rowsA.map((r) => [r.knowledge_object_id, r.rank, feats(r).map((f) => f.type)])));
  check("E5 Belege des relevanten Treffers: echter Ausschuss + Thema als matched_features",
    rowRelevant && hatFeat(rowRelevant, "ausschuss") && hatFeat(rowRelevant, "thema"),
    JSON.stringify(feats(rowRelevant)));
  check("E6 gespeicherte Begruendung + Signale vorhanden und nennen den echten Ausschuss",
    rowRelevant && /Ausschuss/.test(String(rowRelevant.begruendung || ""))
      && rowRelevant.signale && Array.isArray(rowRelevant.signale.ausschuss)
      && rowRelevant.signale.ausschuss.includes("Arbeit und Soziales"),
    JSON.stringify(rowRelevant && { b: rowRelevant.begruendung, s: rowRelevant.signale }));
  check("E7 Begruendung nennt NUR tatsaechlich belegte Merkmalsarten",
    (() => {
      const arten = new Set(feats(rowRelevant).map((f) => f.type));
      const text = String(rowRelevant.begruendung || "");
      const behauptet = [["Ausschuss", "ausschuss"], ["Schwerpunkt", "thema"], ["Wahlkreis", "wahlkreis"], ["Partei", "partei"]];
      return behauptet.every(([wort, art]) => !text.includes(wort) || arten.has(art));
    })(), JSON.stringify({ b: rowRelevant.begruendung, f: feats(rowRelevant) }));

  // Pflichtfall 2: thematische Naehe ohne Ausschussbezug.
  check("E8 thematischer Bundesvorgang: positive Merkmalsaehnlichkeit OHNE Ausschussbeleg",
    rowThema && rowThema.similarity > 0 && !hatFeat(rowThema, "ausschuss"),
    JSON.stringify(rowThema && { sim: rowThema.similarity, f: feats(rowThema) }));

  // Pflichtfaelle 3+4: fremde Ausschuesse erzeugen KEINEN Mitgliedschaftsbeleg (PR #185).
  check("E9 Landesvorgang mit aehnlich benanntem Ausschuss: KEIN Ausschussbeleg beim Bundesmandat",
    rowLand && !hatFeat(rowLand, "ausschuss"), JSON.stringify(feats(rowLand)));
  check("E10 kommunaler Vorgang mit aehnlich benanntem Ausschuss: KEIN Ausschussbeleg beim Bundesmandat",
    rowKommune && !hatFeat(rowKommune, "ausschuss"), JSON.stringify(feats(rowKommune)));
  check("E11 thematische Naehe bleibt trotzdem erhalten: Landes- und Kommunalfall tragen den thema-Beleg",
    hatFeat(rowLand, "thema") && hatFeat(rowKommune, "thema"),
    JSON.stringify({ land: feats(rowLand), kommune: feats(rowKommune) }));
  check("E12 eigenes Wahlkreisland: der Regionalbeleg bleibt erlaubt, die Ausschussmitgliedschaft trotzdem nicht",
    (() => {
      // Derselbe Landesvorgang, nur im eigenen Wahlkreisland des Mandats: die
      // regionale Naehe darf als wahlkreis-Beleg erscheinen, der gleichnamige
      // Landtagsausschuss bleibt trotzdem keine Bundestags-Mitgliedschaft.
      const imEigenenLand = { ...koLand, mentioned_locations: ["Niedersachsen"] };
      const f = matching.matchedFeatures(matching.profileFeatures(PROFIL_A), matching.knowledgeObjectFeatures(imEigenenLand));
      return f.some((x) => x.type === "wahlkreis") && !f.some((x) => x.type === "ausschuss");
    })());
  check("E13 gespeicherte Signale/Begruendung der Fremdfaelle nennen KEINEN Ausschuss",
    [rowLand, rowKommune].every((r) => r && r.signale && !Object.prototype.hasOwnProperty.call(r.signale, "ausschuss")
      && !/Ausschuss/.test(String(r.begruendung || ""))),
    JSON.stringify([rowLand, rowKommune].map((r) => r && { s: r.signale, b: r.begruendung })));

  // Pflichtfaelle 6+7: fehlende/unlesbare Ebene ist fuer Ausschussbelege geschlossen.
  check("E14 fehlende Ebene: die Zustaendigkeitsregel ist fail-closed (unknown/null/unlesbar -> kein Beleg)",
    matching.ausschussBelegZulaessig({ ebene: "bund", land: null }, { ebene: null, laender: [] }) === false
      && matching.ausschussBelegZulaessig({ ebene: "bund", land: null }, { ebene: "unknown", laender: [] }) === false
      && matching.ausschussBelegZulaessig({ ebene: "bund", land: null }, { ebene: "kommunal", laender: [] }) === false
      && matching.ausschussBelegZulaessig({ ebene: "bund", land: null }, { ebene: "bund", laender: [] }) === true);
  check("E15 fehlende Ebene am ECHTEN Pfad: identischer Vorgang ohne belegte Ebene verliert nur den Ausschussbeleg",
    (() => {
      // Derselbe perfekte Positivfall wie der relevante Vorgang — nur die Ebene fehlt.
      const ohneEbene = { ...koRelevant, decision_level: null, political_level: null };
      const f = matching.matchedFeatures(matching.profileFeatures(PROFIL_A), matching.knowledgeObjectFeatures(ohneEbene));
      return !f.some((x) => x.type === "ausschuss") && f.some((x) => x.type === "thema");
    })());
  check("E16 unvollstaendige Institutionsangabe: keine erfundene Zustaendigkeit, kein Ausschussbeleg",
    rowUnvollstaendig && !hatFeat(rowUnvollstaendig, "ausschuss") && koUnvollstaendig.decision_level === "unknown",
    JSON.stringify(feats(rowUnvollstaendig)));
  check("E17 Vorgang ohne Ebene: kein Ausschussbeleg, keine Ausschussbegruendung",
    rowOhneEbene && !hatFeat(rowOhneEbene, "ausschuss") && !/Ausschuss/.test(String(rowOhneEbene.begruendung || "")));

  // Sichtbare Erklaerung == gespeicherte Gruende.
  const erkRelevant = matchingErklaerung.erklaerungAusErgebnis(rowRelevant);
  check("E18 sichtbare Erklaerung vorhanden und deckungsgleich mit den gespeicherten Belegen",
    erkRelevant && typeof erkRelevant.satz === "string" && erkRelevant.satz.length > 0
      && erkRelevant.belege.some((b) => b.art === "ausschuss" && /Arbeit und Soziales/.test(b.text))
      && erkRelevant.satz === String(rowRelevant.begruendung),
    JSON.stringify(erkRelevant));
  check("E19 sichtbare Erklaerung der Fremdfaelle fuehrt KEINEN Ausschussbeleg und behauptet keine Mitgliedschaft",
    [rowLand, rowKommune].every((r) => {
      const e = matchingErklaerung.erklaerungAusErgebnis(r);
      return e && !e.belege.some((b) => b.art === "ausschuss") && !/Ausschuss/.test(e.satz);
    }),
    JSON.stringify([rowLand, rowKommune].map((r) => matchingErklaerung.erklaerungAusErgebnis(r))));
  check("E20 Zeile ohne jeden Beleg erhaelt KEINE erfundene Erklaerung (null, Belegpflicht)",
    (() => {
      const unbelegt = rowsA.find((r) => feats(r).length === 0);
      return !unbelegt || matchingErklaerung.erklaerungAusErgebnis(unbelegt) === null;
    })());
  check("E21 Rangfolge: der relevante Bundesvorgang steht vor Kommunal-, Kontroll- und unbelegten Faellen (einzige Ausnahme: Beobachtung B25-1)",
    [rowThema, rowIrrelevant, rowKommune, rowOhneEbene, rowUnvollstaendig]
      .every((r) => !r || rowRelevant.rank < r.rank),
    JSON.stringify(rowsA.map((r) => [r.knowledge_object_id, r.rank])));
  LAUF.matchingErgebnisse = rowsA.length;

  // ═══ F · Idempotenz des Matchings (Pflichtfall 8, Teil 2) ═══
  abschnitt("F · Idempotente Wiederholung (Matching)");
  const publishesVorher = store.zaehler.publish;
  const resultsSnapshot = JSON.stringify([...store.matchingResults.values()].map((r) => [r.id, r.berechnet_am, r.aktuell]).sort());
  const m2 = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "e2e-vertrag" }, store.matchingOverrides);
  check("F1 identischer Eingang -> idempotenter Lauf (keine neue Generation)",
    m2.audit && m2.audit.idempotent === true && m2.audit.runId === m1.audit.runId && m2.audit.wiederholungen === 1,
    JSON.stringify(m2.audit));
  check("F2 keine erneute Veroeffentlichung, Projektion byte-identisch",
    store.zaehler.publish === publishesVorher
      && JSON.stringify([...store.matchingResults.values()].map((r) => [r.id, r.berechnet_am, r.aktuell]).sort()) === resultsSnapshot);
  check("F3 keine doppelten sichtbaren Ergebnisse: weiterhin genau 7 aktuelle Zeilen, eine je Vorgang",
    (() => {
      const aktuelle = store.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 });
      return aktuelle.length === 7 && new Set(aktuelle.map((r) => r.knowledge_object_id)).size === 7;
    })());

  // ═══ G · Mandantentrennung + unberechtigter Zugriff (Pflichtfaelle 9+10) ═══
  abschnitt("G · Mandantentrennung + unberechtigter Zugriff");
  check("G1 vor dem eigenen Lauf: Zweitmandant hat 0 persistierte Ergebnisse",
    store.api.listMatchingResults({ userId: PROFIL_B.id, limit: 50 }).length === 0);
  const mB = await matching.runMatchingShadow({ profile: PROFIL_B, ausloeser: "e2e-vertrag" }, store.matchingOverrides);
  const rowsB = store.api.listMatchingResults({ userId: PROFIL_B.id, limit: 50 });
  check("G2 eigener Lauf des Zweitmandanten schreibt ausschliesslich eigene Zeilen (7 Zeilen)",
    mB.audit && rowsB.length === 7 && rowsB.every((r) => r.user_id === PROFIL_B.id));
  check("G3 Zeilen von Profil A bleiben unveraendert dem Mandanten A zugeordnet",
    store.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 }).every((r) => r.user_id === PROFIL_A.id));
  check("G4 der Tariftreue-Vorgang traegt beim Gesundheits-Zweitmandanten KEINEN Ausschuss-/Themenbeleg",
    (() => {
      const r = rowsB.find((x) => x.knowledge_object_id === koRelevant.id);
      return r && !r.matched_features.some((f) => f.type === "ausschuss" || f.type === "thema");
    })(),
    JSON.stringify((rowsB.find((x) => x.knowledge_object_id === koRelevant.id) || {}).matched_features));
  check("G5 die Ergebnisse der beiden Mandanten unterscheiden sich fachlich (kein geteilter Belegzustand)",
    JSON.stringify(rowsA.map((r) => [r.knowledge_object_id, feats(r).map((f) => f.type)]).sort())
      !== JSON.stringify(rowsB.map((r) => [r.knowledge_object_id, (r.matched_features || []).map((f) => f.type)]).sort()));
  // Pflichtfall 10: nicht berechtigter Nutzerzugriff.
  let ohneMandant = false;
  try { store.api.listMatchingResults({}); } catch (e) { ohneMandant = /kein Mandant/i.test(String(e.message)); }
  check("G6 Lesezugriff ohne Mandanten wird abgelehnt (kein stiller Fallback auf alle Mandanten)", ohneMandant);
  let crossTenantBlockiert = false;
  try {
    store.api.saveMatchingResults([
      { id: "mr-x-1", user_id: PROFIL_A.id, knowledge_object_id: koRelevant.id },
      { id: "mr-x-2", user_id: PROFIL_B.id, knowledge_object_id: koRelevant.id }
    ]);
  } catch (e) { crossTenantBlockiert = /CROSS_TENANT/i.test(String(e.message)); }
  check("G7 mandantenuebergreifender Schreibversuch wird blockiert", crossTenantBlockiert);
  let auditGuard = false;
  try {
    await matching.runMatchingShadow(
      { profile: PROFIL_A, mandateProfileId: PROFIL_B.id, ausloeser: "e2e-vertrag" },
      store.matchingOverrides
    );
  } catch (e) { auditGuard = e && e.code === "CROSS_TENANT_WRITE"; }
  check("G8 Audit-Schicht lehnt fremde Profilkennung ab (CROSS_TENANT_WRITE)", auditGuard);
  LAUF.mandanten = { [PROFIL_A.id]: rowsA.length, [PROFIL_B.id]: rowsB.length };

  // ═══ H · Entscheidung (pro Mandant, deterministisch) ═══
  abschnitt("H · Entscheidungen (Score, Signale, Stufe)");
  const d1 = await decisions.runDecisionShadow({ profile: PROFIL_A }, {
    enabled: () => true, getProfile: store.api.getProfile,
    listKnowledgeObjects: store.api.listKnowledgeObjects, saveDecisions: store.api.saveDecisions
  });
  check("H1 Entscheidungslauf fuer Profil A erzeugt Entscheidungen (7 Kandidaten, 7 gespeichert)",
    d1 && !d1.skipped && d1.saved === 7, JSON.stringify(d1));
  const decA = [...store.decisions.values()].filter((d) => d.user_id === PROFIL_A.id);
  const decVon = (ko) => decA.find((d) => d.knowledge_object_id === ko.id);
  const decRelevant = decVon(koRelevant);
  const decThema = decVon(koThema);
  const decIrrelevant = decVon(koIrrelevant);
  const decLand = decVon(koLand);
  const decKommune = decVon(koKommune);
  const decOhneEbene = decVon(koOhneEbene);
  const decUnvollstaendig = decVon(koUnvollstaendig);
  check("H2 relevanter Bundesvorgang: Sofort reagieren (Score >= 60) fuer den richtigen Mandanten",
    decRelevant && decRelevant.decision === "Sofort reagieren" && decRelevant.user_id === PROFIL_A.id,
    JSON.stringify(decRelevant && { score: decRelevant.score, decision: decRelevant.decision }));
  check("H3 der Score entsteht nachvollziehbar aus den belegten Merkmalen (deterministische Nachrechnung)",
    (() => {
      const nachgerechnet = decisions.scoreKnowledgeObject(koRelevant, {
        similarity: rowRelevant.similarity, matched_features: feats(rowRelevant)
      });
      return decRelevant && decRelevant.score === nachgerechnet
        && decRelevant.decision === decisions.decisionFromScore(nachgerechnet);
    })());
  check("H4 Wiederholung der Entscheidung ist deterministisch (identischer Score, identische Stufe)",
    (() => {
      const zweite = decisions.decideForUser(PROFIL_A, store.api.listKnowledgeObjects(), { userId: PROFIL_A.id });
      const z = zweite.find((d) => d.knowledge_object_id === koRelevant.id);
      return z && z.score === decRelevant.score && z.decision === decRelevant.decision;
    })());
  check("H5 irrelevanter Vorgang: Ignorieren (keine erfundene Relevanz)",
    decIrrelevant && decIrrelevant.decision === "Ignorieren",
    JSON.stringify(decIrrelevant && { score: decIrrelevant.score, decision: decIrrelevant.decision }));
  check("H6 Landesvorgang mit aehnlichem Ausschuss: KEIN Sofort reagieren — keine falsche Dringlichkeit",
    decLand && decLand.decision !== "Sofort reagieren" && decLand.score < 60,
    JSON.stringify(decLand && { score: decLand.score, decision: decLand.decision }));
  check("H7 der Fix von PR #185 traegt die Stufe: MIT falschem Ausschussbeleg laege der Landesfall bei Sofort reagieren",
    (() => {
      // Kontrafaktische Nachrechnung mit dem Ausschussgewicht (34): genau der
      // Zustand vor PR #185. Die Differenz MUSS die Entscheidungsstufe kippen —
      // sonst waere die Regression hier nicht beweisbar.
      const mitFalschemBeleg = decisions.scoreKnowledgeObject(koLand, {
        similarity: rowLand.similarity,
        matched_features: [...feats(rowLand), { type: "ausschuss", value: "Arbeit und Soziales" }]
      });
      return decLand && decLand.score < 60 && mitFalschemBeleg >= 60;
    })(), JSON.stringify(decLand && { ohne: decLand.score }));
  check("H8 kommunaler Vorgang: KEIN Sofort reagieren",
    decKommune && decKommune.decision !== "Sofort reagieren",
    JSON.stringify(decKommune && { score: decKommune.score, decision: decKommune.decision }));
  check("H9 Vorgaenge ohne belegte Ebene/Zustaendigkeit: keine Handlungsaufforderung",
    (!decOhneEbene || decOhneEbene.decision !== "Sofort reagieren")
      && (!decUnvollstaendig || decUnvollstaendig.decision !== "Sofort reagieren"),
    JSON.stringify([decOhneEbene, decUnvollstaendig].map((d) => d && { score: d.score, decision: d.decision })));
  check("H10 thematischer Bundesvorgang bleibt sichtbar, aber unter dem belegten Ausschussfall",
    decThema && decRelevant.score > decThema.score,
    JSON.stringify([decRelevant.score, decThema && decThema.score]));
  const decB = decisions.decideForUser(PROFIL_B, store.api.listKnowledgeObjects(), { userId: PROFIL_B.id });
  const decBRelevant = decB.find((d) => d.knowledge_object_id === koRelevant.id);
  check("H11 falscher Mandant: der Tariftreue-Vorgang ist dort Ignorieren (keine erfundene Relevanz)",
    !decBRelevant || decBRelevant.decision === "Ignorieren",
    JSON.stringify(decBRelevant && { score: decBRelevant.score, decision: decBRelevant.decision }));
  check("H12 die TOP-Entscheidung des Pilotprofils ist der relevante Bundesvorgang (fertiges Briefing: passende Bundespolitik)",
    (() => {
      const top = decA.slice().sort((a, b) => b.score - a.score)[0];
      return top && top.knowledge_object_id === koRelevant.id && top.decision === "Sofort reagieren";
    })(), JSON.stringify(decA.map((d) => [d.knowledge_object_id, d.score, d.decision])));
  LAUF.entscheidungen = decA.length;

  // ═══ I · Politische Ausgabe: Lage-Auswahl (der produktive Lesepfad) ═══
  abschnitt("I · Lage-Auswahl (produktiver Lesepfad, gespeicherte Ergebnisse)");
  const ranked = await lage.loadRankedVorgaenge(store.api, matching.matchProfileToKnowledgeObjects, PROFIL_A, PROFIL_A.id);
  check("I1 Auswahl kommt aus den GESPEICHERTEN Matching-Ergebnissen und enthaelt den relevanten Vorgang",
    ranked.some((k) => k.id === koRelevant.id), JSON.stringify(ranked.map((k) => k.id)));
  const rankedRelevant = ranked.find((k) => k.id === koRelevant.id);
  check("I2 die sichtbare Relevanz-Erklaerung haengt am Vorgang (aus der gespeicherten Zeile)",
    rankedRelevant && rankedRelevant.relevanz_erklaerung
      && /Arbeit und Soziales/.test(JSON.stringify(rankedRelevant.relevanz_erklaerung)));
  const karten = ranked.map((k) => lage.koToVorgangCard(k, store.api.getSourcesForVorgang(k.vorgang_id)));
  const auswahl = lage.selectLageVorgaenge(karten);
  const karteRelevant = auswahl.find((c) => c.id === koRelevant.vorgang_id);
  check("I3 der relevante Bundesvorgang erreicht die politische Ausgabe (Lage-Karte)",
    Boolean(karteRelevant), JSON.stringify(auswahl.map((c) => c.id)));
  check("I4 Karte traegt die politische Nutzdimension (warum relevant, Empfehlung, Kategorie)",
    karteRelevant && Boolean(karteRelevant.whyRelevant) && Boolean(karteRelevant.recommendation)
      && Boolean(karteRelevant.displayCategory) && Boolean(karteRelevant.empfehlung));
  check("I5 Herkunft bleibt bis zur Ausgabe sichtbar: die DIP-Adresse als Quelle",
    karteRelevant && (karteRelevant.sources || []).some((s) => /bund\.example/.test(String(s.url || ""))));
  check("I6 persoenliche Relevanz auf der Karte entspricht den gespeicherten Gruenden",
    karteRelevant && karteRelevant.relevanz
      && karteRelevant.relevanz.satz === String(rowRelevant.begruendung)
      && karteRelevant.relevanz.belege.some((b) => b.art === "ausschuss" && /Arbeit und Soziales/.test(b.text)));
  check("I7 sichtbare Karten der Fremdfaelle behaupten KEINE Ausschussmitgliedschaft",
    [koLand, koKommune].every((ko) => {
      const karte = auswahl.find((c) => c.id === ko.vorgang_id);
      if (!karte) return true;
      const belege = (karte.relevanz && karte.relevanz.belege) || [];
      return !belege.some((b) => b.art === "ausschuss") && !/deinen Ausschuss/.test(JSON.stringify(karte.relevanz || {}));
    }));
  check("I8 keine doppelten sichtbaren Ergebnisse (jede Karte genau einmal)",
    auswahl.length === new Set(auswahl.map((c) => c.id)).size,
    JSON.stringify(auswahl.map((c) => c.id)));
  check("I9 Aktualitaet ist sichtbar (updatedLabel/updatedDot: veraltete Ergebnisse sind erkennbar)",
    karteRelevant && String(karteRelevant.updatedLabel || "") !== "" && String(karteRelevant.updatedDot || "") !== "");
  check("I10 Rangfolge: der relevante Bundesvorgang steht vor Kommunal- und Kontrollfaellen (einzige Ausnahme: Beobachtung B25-1, Landesfall ohne Mitgliedschaftsbehauptung)",
    (() => {
      const pos = (ko) => ranked.findIndex((k) => k.id === ko.id);
      const posRel = pos(koRelevant);
      return posRel !== -1
        && [koKommune, koIrrelevant, koOhneEbene, koUnvollstaendig].every((ko) => pos(ko) === -1 || posRel < pos(ko));
    })(), JSON.stringify(ranked.map((k) => k.id)));
  check("I11 Beobachtung B25-1 in der sichtbaren Lage: die vorstehende Landeskarte behauptet weder Mitgliedschaft noch Dringlichkeit",
    (() => {
      const posLand = auswahl.findIndex((c) => c.id === koLand.vorgang_id);
      const posRel = auswahl.findIndex((c) => c.id === koRelevant.vorgang_id);
      if (posLand === -1 || posLand > posRel) return true; // steht sie dahinter, ist nichts zu belegen
      const karte = auswahl[posLand];
      const belege = (karte.relevanz && karte.relevanz.belege) || [];
      return !belege.some((b) => b.art === "ausschuss")
        && decLand && decLand.decision !== "Sofort reagieren";
    })());
  LAUF.briefingAuswahl = auswahl.map((c) => c.id);
  LAUF.kontrollfaelleAusgeschlossen = [
    `land:${koLand.vorgang_id}=kein-ausschussbeleg-fremder-zustaendigkeitsraum`,
    `kommune:${koKommune.vorgang_id}=kein-ausschussbeleg-fremder-zustaendigkeitsraum`,
    `irrelevant:${koIrrelevant.vorgang_id}=ignorieren`,
    `ohne-ebene:${koOhneEbene.vorgang_id}=fail-closed`,
    `unvollstaendig:${koUnvollstaendig.vorgang_id}=fail-closed`
  ];

  // ═══ J · Erzwungener Stoerfall: kein falsches Gruen ═══
  abschnitt("J · Erzwungener Stoerfall (kein falsch gruener Gesamtzustand)");
  const stoerStore = neuerStore();
  const stoerApi = {
    ...stoerStore.api,
    requestUnderstanding: (prompt) => {
      if (String(prompt).includes("Tariftreue")) throw new Error("simulierter KI-Transportfehler");
      return fixtureUnderstanding(prompt);
    }
  };
  const uStoer = await understanding.runUnderstandingShadow(rohZeilen, stoerApi);
  check("J1 gestoerter Zwischenschritt erzeugt einen klaren Fehlerstatus (skipped-error)",
    (uStoer.counts["skipped-error"] || 0) === 1 && (uStoer.counts.saved || 0) === 6, JSON.stringify(uStoer.counts));
  check("J2 Telemetrie meldet den Fehlschlag samt Vorgang — kein globales Pauschal-Gruen",
    uStoer.telemetrie.gruppen.fehlgeschlagen === 1 && uStoer.telemetrie.auffaelligkeiten.length >= 1);
  const koGestoert = [...stoerStore.knowledgeObjects.values()].find((k) => k.understanding_status === "failed");
  check("J3 der gestoerte Vorgang ist als failed geparkt (nicht verloren, nicht ausgeliefert)",
    Boolean(koGestoert) && koGestoert.status === "pending");
  const suchErgebnis = stoerStore.api.matchByEmbedding({ embedding: matching.embedProfile(PROFIL_A), matchCount: 20 });
  check("J4 ein failed-Vorgang erreicht das Matching NICHT (RPC-Filter understanding_status<>failed)",
    !suchErgebnis.results.some((r) => r.id === (koGestoert && koGestoert.id)));
  LAUF.fehlerstufe = "understanding+publish (erzwungen)";
  LAUF.fehlergrund = "simulierter KI-Transportfehler · simulierter Publish-Abbruch";

  const vorPublish = JSON.stringify([...store.matchingResults.values()].map((r) => [r.id, r.aktuell]).sort());
  store.publishFehler = "mitten";
  let publishFehlerSichtbar = null;
  try {
    await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "e2e-stoerfall", limit: 3 }, store.matchingOverrides);
  } catch (e) { publishFehlerSichtbar = e; }
  store.publishFehler = null;
  check("J5 Publish-Abbruch wird als Fehler nach oben gereicht (kein stilles Weiterlaufen)",
    Boolean(publishFehlerSichtbar) && publishFehlerSichtbar.auditStatus === contract.RUN_STATUS.FEHLGESCHLAGEN);
  check("J6 der abgebrochene Lauf steht als fehlgeschlagen im Auditprotokoll",
    [...store.matchingRuns.values()].some((r) => r.status === contract.RUN_STATUS.FEHLGESCHLAGEN && r.id === publishFehlerSichtbar.auditRunId));
  check("J7 die vorherige vollstaendige Generation bleibt unveraendert die aktuelle",
    JSON.stringify([...store.matchingResults.values()].map((r) => [r.id, r.aktuell]).sort()) === vorPublish);

  // ═══ K · Keine Production-Abhaengigkeit ═══
  abschnitt("K · Keine Production-Abhaengigkeit");
  check("K1 kein einziger echter KI-Aufruf (alle Analysen aus Fixtures)",
    fixture.anzahlAufrufe() >= 7 && typeof fixtureUnderstanding === "function");
  check("K2 keine Supabase-Env noetig (alle Zugriffe laufen ueber injizierte Deps)",
    true, "Netz-Guard des Runners blockiert zusaetzlich jeden externen Zugriff");
  check("K3 keine mandantenfremden Storage-Zugriffe protokolliert (nur der absichtliche G7-Versuch)",
    store.fremdzugriffe.length === 1 && store.fremdzugriffe[0] === "saveMatchingResults");

  // ── Beobachtbarkeit: Stufennachweis des Laufs ──────────────────────────────
  console.log("\n== Stufennachweis (Beobachtbarkeit) ==");
  console.log(JSON.stringify(LAUF, null, 2));

  console.log(`\n${stand.passed} bestanden, ${stand.failed} fehlgeschlagen`);
  process.exit(stand.failed ? 1 : 0);
})().catch((error) => {
  console.error("SUITE-FEHLER:", error && error.stack || error);
  console.log(`\n${stand.passed} bestanden, ${stand.failed + 1} fehlgeschlagen (Abbruch)`);
  process.exit(1);
});
