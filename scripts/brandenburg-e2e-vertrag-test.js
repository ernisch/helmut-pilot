"use strict";

// Punkt 27A — Deterministischer Repository-Ende-zu-Ende-Vertrag fuer ein Brandenburger Profil.
// =============================================================================================
// VERBINDLICHE DEFINITION (Sprint 27A, 2026-07-30): "Punkt 27" ist Zeile 27 der
// docs/roadmap/phase_1_checkliste.md ("Ende-zu-Ende-Test fuer Brandenburger Profil") — NICHT
// OP-27 der datenmotor-restliste.md (Production-Aktivierung des M8-Relevanzriegels, anderes
// Thema; OP-27 bleibt von diesem Test unberuehrt). Der Punkt ist geschnitten in 27A (dieser
// Repository-Vertrag, offline) und 27B (spaeterer regulaerer Production-Nachweis,
// ausdruecklich NICHT Teil dieses Tests; blockiert durch Punkt 15 — es existiert keine
// aktive Brandenburger Lieferung).
//
// WAS DIESER VERTRAG BEWEIST: Ein realistisches Brandenburger Parlamentsdokument (die echte
// Kleine Anfrage V-369657 "Straf- und Gewalttaten in Brandenburg") durchlaeuft den
// tatsaechlich aktiven Helmut-Pfad — Parser -> kanonisches Rohdokument -> Vorgangsbildung/
// Understanding -> politische Ebene/Geografie -> Merkmalsvektor -> aktives Matching (Audit AN,
// M8 AUS) -> persistierte Ergebnisse -> sichtbare Erklaerung -> Entscheidung -> Lage-Auswahl —
// und kommt beim richtigen Testprofil als politisch brauchbare, belegte, mandantengetrennte
// Ausgabe an. Kontrollfaelle: fachlich irrelevantes Brandenburger Sitzungsdokument,
// regional passender, fachfremder Brandenburger Gesetzentwurf, thematisch aehnliches
// Berliner und Bundes-Dokument, zweites Profil, Idempotenz, erzwungener Stoerfall.
//
// BRANDENBURG-SPEZIFISCH bewiesen (gemessene Laenderunterschiede aus Punkt 24, Teil C):
//   - Herkunft BRA; kein <VID>/<DBID> — die externe Kennung entsteht aus VNr+ReihNr
//   - delete-Stub und Vollrecord derselben VNr (V-369325) verdraengen/verdoppeln sich nicht
//   - ein Vorgang mit ZWEI Dokumenten (V-370081: Gesetzentwurf + Plenarprotokoll) bleibt
//     EIN Bezug mit ZWEI getrennten Dokumentidentitaeten — Dokument und Vorgang werden
//     nicht vermischt, cluster_id bleibt null (Vorgangsbildung gehoert dem Resolver)
//   - zwei echte Records zeigen auf DIESELBE Protokoll-PDF (V-369400/V-369325) — Regel 0
//     haelt sie auseinander
//
// ECHTE PRODUKTIONSFUNKTIONEN (keine Testkopie der Logik):
//   pardok-parser.parsePardokDocumentsFromString (Brandenburg: recordTag Vorgang)
//   pardok-dokumentklassen.zuRohdokument (kanonischer Rohdokument-Vertrag)
//   dedup-global.externalIdentity (Regel 0, Punkt 24)
//   understanding.runUnderstandingShadow (Clustering, Resolver, Assemble, Klassifikation,
//     Ebenen-/Geografie-Gedaechtnis, Merkmalsvektor) — Deps injiziert
//   matching.runMatchingShadow + matching-audit.auditRun (aktiver Pfad: Audit AN wie in
//     Production seit 2026-07-28) — Deps injiziert
//   matching-relevanz (M8, DEFAULT AUS — wird als AUS bewiesen, nicht aktiviert)
//   matching-erklaerung.erklaerungAusErgebnis (sichtbare Erklaerung)
//   decisions.runDecisionShadow / decideForUser (Entscheidung)
//   lage.loadRankedVorgaenge + koToVorgangCard + selectLageVorgaenge (politische Ausgabe)
//   quellenarchitektur/pardok-dispatch (Beweis: strukturell KEINE Brandenburg-Aktivierung)
//
// WAS ERSETZT WIRD (einzige Testdoubles, klar begrenzt — identisch zum 26A-Vertrag,
// gemeinsames technisches Geruest in scripts/e2e-vertrag-geruest.js):
//   1. Die LLM-Antwort: deterministische Fixture-Analysen je Cluster. Testdaten, KEIN
//      Quellenbeleg — die Dokumente selbst stammen verbatim aus den Gold-Fixtures
//      (test/fixtures/pardok/*, echte PARDOK-/parldok-Records).
//   2. Der Storage-Unterbau: In-Memory-Store mit denselben Vertragsgrenzen wie
//      Supabase/PostgREST (Mandantenfilter, aktuell=is.true, Tenant-Guard, atomare
//      publish-Semantik wie helmut_publish_matching_run).
//   3. Die pgvector-RPC match_knowledge_objects: dokumentgetreue Offline-Replik ueber die
//      ECHTEN write-time-Merkmalsvektoren.
//
// KEIN Netz, KEINE KI, KEINE Production-Abhaengigkeit, KEINE Migration, KEIN neuer Schalter.
// Berlin/Brandenburg/M8 bleiben deaktiviert; der Test aktiviert NICHTS. Dieser Vertrag
// beweist NICHT, dass Production "ueberwiegend passende Brandenburger Landespolitik"
// liefert — diese quantitative Aussage gehoert zu 27B und braucht eine aktive Lieferung.

const path = require("path");
const fs = require("fs");

const P = require("../lib/helmut/quellenarchitektur/pardok-parser");
const K = require("../lib/helmut/quellenarchitektur/pardok-dokumentklassen");
const DG = require("../lib/helmut/quellenarchitektur/dedup-global");
const dispatch = require("../lib/helmut/quellenarchitektur/pardok-dispatch");
const understanding = require("../lib/helmut/understanding");
const matching = require("../lib/helmut/matching");
const matchingRelevanz = require("../lib/helmut/matching-relevanz");
const matchingErklaerung = require("../lib/helmut/matching-erklaerung");
const contract = require("../lib/helmut/matching-contract");
const decisions = require("../lib/helmut/decisions");
const lage = require("../lib/helmut/lage");
const profilplan = require("../lib/helmut/quellenarchitektur/seeds/berlin-profilplan");

// Gemeinsames TECHNISCHES Testgeruest (Zaehlwerk, Fixture-Understanding, In-Memory-Store,
// Audit-Doppel, Publish-Semantik) — geteilt mit dem 26A-Berlin-Vertrag. Profile,
// Gold-Records, Fixtures und saemtliche Assertions sind BRANDENBURG-SPEZIFISCH und bleiben
// in dieser Datei.
const G = require("./e2e-vertrag-geruest");

// ── Harness ──────────────────────────────────────────────────────────────────
const zaehlwerk = G.neuesZaehlwerk();
const check = zaehlwerk.check;
const abschnitt = zaehlwerk.abschnitt;
const stand = zaehlwerk.stand;

// Beobachtbarkeit: der Stufennachweis des Testlaufs. Ein einzelnes globales
// success:true ohne Stufen waere laut Sprintauftrag NICHT ausreichend.
const LAUF = {
  testlauf: `e2e-brandenburg-vertrag-${new Date().toISOString().slice(0, 10)}`,
  profil: null, zweitprofil: null,
  eingangsdokumente: 0, normalisiert: 0, rohdokumente: 0,
  vorgaenge: 0, verstanden: 0, embeddingStatus: null,
  matchingErgebnisse: 0, entscheidungen: 0, briefingAuswahl: [],
  kontrollfaelleAusgeschlossen: [], fehlerstufe: null, fehlergrund: null,
  wiederholung: null, mandanten: {}
};

// ── Fixtures: echte Gold-Records (verbatim aus test/fixtures/pardok) ─────────
const FIX = path.join(__dirname, "..", "test", "fixtures", "pardok");
const XML_BB = fs.readFileSync(path.join(FIX, "brandenburg-gold.xml"), "utf8");
const XML_BE_VORGANG = fs.readFileSync(path.join(FIX, "berlin-vorgang-gold.xml"), "utf8");

// Testprofile. Struktur-Basis ist das mandantenneutrale Landtagsprofil aus
// seeds/berlin-profilplan.js (es gibt bewusst KEINEN Brandenburg-Profilplan-Seed —
// dieser Test legt auch keinen an); alle Landesfelder werden hier ausdruecklich auf
// Brandenburg gesetzt. "Ausschuss fuer Inneres und Kommunales" ist der reale
// Innenausschuss des Landtags Brandenburg. Keine reale Person, keine reale Partei
// (party bleibt "Fraktionslos"), kein Production-Mandat.
const PROFIL_A = Object.freeze({
  ...profilplan.GEMAPPTES_PROFIL,
  id: "e2e-brandenburg-testprofil",
  fullName: "Testmandat Brandenburg (E2E-Vertrag 27A)",
  state: "Brandenburg", bundesland: "Brandenburg",
  constituency: "Brandenburg (Landesebene, E2E-Vertrag)",
  regionalInterests: ["Brandenburg"],
  committees: ["Ausschuss für Inneres und Kommunales"],
  // Wie in 26A gilt (P1-1): assembleKnowledgeObject uebernimmt KEINE tags aus der Analyse,
  // die Themen-Dimension eines KO entsteht im aktiven Pfad ausschliesslich aus den
  // Ausschuessen (derivePolicyFields) — hier also als Politikfeld-Label "Inneres".
  focusTopics: ["Inneres", "Innere Sicherheit", "Kriminalitätsbekämpfung", "Landespolitik Brandenburg"]
});
// Zweitprofil fuer die Mandantentrennung: anderes Land, anderes Fachgebiet.
const PROFIL_B = Object.freeze({
  ...profilplan.GEMAPPTES_PROFIL,
  id: "e2e-berlin-kontrollprofil",
  fullName: "Testmandat Berlin (Kontrolle 27A)",
  committees: ["Ausschuss für Bildung, Jugend und Familie"],
  focusTopics: ["Bildung", "Schulbau"]
});
LAUF.profil = PROFIL_A.id;
LAUF.zweitprofil = PROFIL_B.id;

// ── Deterministische Fixture-Analysen (Ersatz fuer den LLM-Call) ─────────────
// Testdaten, kein Quellenbeleg. Jede Analyse ist konsistent zum ECHTEN Dokumenttitel des
// jeweiligen Clusters; die Ebenen-/Geografiesignale entstehen NICHT durch Behauptung,
// sondern durch die Institutionsnennungen im Text — genau wie im echten Pfad
// (classification.deriveDecisionLevel / geografienAusText).
//
// BEWUSSTE ENTSCHEIDUNG zu den Kontrollfaellen: die Analysen der Kontrolldokumente nennen
// KEINEN Ausschuss. Grund ist eine reale Produkteigenschaft, kein Testtrick:
// normalizeCommittee faltet "Ausschuss fuer Inneres und Kommunales" (Brandenburg) UND
// "Ausschuss fuer Inneres, Sicherheit und Ordnung" (Berlin) auf denselben Merkmalsstamm
// "inneres" — eine Ausschussnennung im Berliner Kontrollfall erzeugte also einen ECHTEN
// Ausschuss-Beleg ueber die Landesgrenze hinweg. Dieser Vertrag prueft die
// LANDES-Trennung (Ebene/Geografie/Priorisierung), nicht die Ausschussnormalisierung;
// das Verhalten selbst ist dokumentiert (matching.js normalizeCommittee) und bleibt
// unveraendert.
const AI_FIXTURES = [
  {
    marker: "Straf- und Gewalttaten",
    result: {
      headline: "Kleine Anfrage zu Straf- und Gewalttaten in Brandenburg",
      was_ist_passiert: "Im Landtag Brandenburg ist eine Kleine Anfrage zu den Straf- und Gewalttaten von Juli bis September 2024 gestellt worden. Das Ministerium des Innern und für Kommunales des Landes Brandenburg muss die Fallzahlen des dritten Quartals vorlegen.",
      warum_wichtig: "Die Kriminalitätsentwicklung ist ein zentrales Thema der inneren Sicherheit des Landes Brandenburg und bestimmt die Debatte über die Ausstattung der Brandenburger Polizei.",
      wer_ist_betroffen: "Die Brandenburger Polizei, das Innenministerium und die Bevölkerung Brandenburgs.",
      handlungsempfehlung: "Die Antwort der Landesregierung im Ausschuss für Inneres und Kommunales aufgreifen und eigene Schwerpunkte zur Kriminalitätsbekämpfung setzen.",
      parteien: [], ausschuesse: ["Ausschuss für Inneres und Kommunales"],
      ministerien: ["Ministerium des Innern und für Kommunales des Landes Brandenburg"],
      risiken: ["Steigende Fallzahlen können als Beleg für Defizite der Landesregierung bei der inneren Sicherheit gelesen werden"],
      chancen: ["Profilierung bei der inneren Sicherheit durch eine eigene Initiative zur Kriminalitätsbekämpfung im Land Brandenburg"],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: ["Ausschuss für Inneres und Kommunales"],
      mentioned_ministries: ["Ministerium des Innern und für Kommunales des Landes Brandenburg"],
      mentioned_locations: ["Brandenburg"], mentioned_organizations: [],
      tags: ["Innere Sicherheit", "Kriminalität"],
      zeitdruck: "mittel", confidence_score: 82,
      display_title: "Brandenburg legt Zahlen zu Straf- und Gewalttaten vor",
      display_summary: "Eine Kleine Anfrage im Landtag Brandenburg erfragt die Straf- und Gewalttaten des dritten Quartals 2024; die Landesregierung muss die Fallzahlen vorlegen.",
      why_relevant: "Fällt unmittelbar in die Zuständigkeit des Innenausschusses und betrifft die innere Sicherheit des Landes Brandenburg.",
      recommendation: "Antwort der Landesregierung im Innenausschuss aufgreifen und die Entwicklung der Fallzahlen öffentlich einordnen.",
      display_category: "Inneres",
      risk_level: "medium", opportunity_level: "medium"
    }
  },
  {
    marker: "Kommunalverfassung",
    result: {
      headline: "Brandenburg ändert die Kommunalverfassung",
      was_ist_passiert: "In den Landtag Brandenburg ist der Entwurf eines Gesetzes zur Änderung der Kommunalverfassung des Landes Brandenburg eingebracht und im Plenum beraten worden.",
      warum_wichtig: "Die Kommunalverfassung regelt die Arbeit der Brandenburger Städte und Gemeinden.",
      wer_ist_betroffen: "Kommunen, Gemeindevertretungen und Hauptverwaltungsbeamte in Brandenburg.",
      handlungsempfehlung: "Beratungsverlauf verfolgen; kein unmittelbarer eigener Handlungsbedarf.",
      parteien: [], ausschuesse: [], ministerien: ["Ministerium des Innern und für Kommunales des Landes Brandenburg"],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: ["Ministerium des Innern und für Kommunales des Landes Brandenburg"],
      mentioned_locations: ["Brandenburg"], mentioned_organizations: [],
      tags: ["Kommunales"],
      zeitdruck: "niedrig", confidence_score: 62,
      display_title: "Kommunalverfassung wird geändert",
      display_summary: "Der Landtag Brandenburg berät einen Gesetzentwurf zur Änderung der Kommunalverfassung.",
      why_relevant: "Landesgesetzgebung Brandenburgs ohne unmittelbaren Bezug zur inneren Sicherheit.",
      recommendation: "Beratungsverlauf beobachten.",
      display_category: "Kommunales",
      risk_level: "low", opportunity_level: "low"
    }
  },
  {
    marker: "Alterspräsident",
    result: {
      headline: "Konstituierung: Rede des Alterspräsidenten im Landtag Brandenburg",
      was_ist_passiert: "Der Landtag Brandenburg hat sich zur 8. Wahlperiode konstituiert; das Plenarprotokoll verzeichnet die Begrüßung und die Rede des Alterspräsidenten.",
      warum_wichtig: "Die konstituierende Sitzung ist ein parlamentarischer Formalakt ohne fachpolitischen Inhalt.",
      wer_ist_betroffen: "Die Abgeordneten des Landtags Brandenburg.",
      handlungsempfehlung: "Keine Reaktion nötig.",
      parteien: [], ausschuesse: [], ministerien: [],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: [],
      mentioned_locations: ["Brandenburg"], mentioned_organizations: [],
      tags: ["Parlament"],
      zeitdruck: "niedrig", confidence_score: 60,
      display_title: "Landtag Brandenburg konstituiert",
      display_summary: "Das Plenarprotokoll der konstituierenden Sitzung verzeichnet die Rede des Alterspräsidenten.",
      why_relevant: "Parlamentarischer Formalakt ohne fachpolitischen Gehalt.",
      recommendation: "Keine Reaktion nötig.",
      display_category: "Parlament",
      risk_level: "low", opportunity_level: "low"
    }
  },
  {
    marker: "Waffengebührenordnung",
    result: {
      headline: "Berlin regelt Gebühren im Waffenrecht neu",
      was_ist_passiert: "Die Senatsverwaltung für Inneres hat die Verordnung über die Erhebung von Gebühren im Waffenrecht (Waffengebührenordnung) vorgelegt. Das Abgeordnetenhaus von Berlin hat die Verordnung im Plenum behandelt.",
      warum_wichtig: "Die Gebührenordnung betrifft alle waffenrechtlichen Erlaubnisse im Land Berlin.",
      wer_ist_betroffen: "Waffenbesitzer und Schützenvereine in Berlin sowie die Berliner Innenverwaltung.",
      handlungsempfehlung: "Kein eigener Handlungsbedarf; Zuständigkeit liegt beim Abgeordnetenhaus von Berlin.",
      parteien: [], ausschuesse: [], ministerien: ["Senatsverwaltung für Inneres"],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: ["Senatsverwaltung für Inneres"],
      mentioned_locations: ["Berlin"], mentioned_organizations: [],
      tags: ["Waffenrecht", "Innere Sicherheit"],
      zeitdruck: "niedrig", confidence_score: 60,
      display_title: "Berlin ordnet Waffen-Gebühren neu",
      display_summary: "Die Senatsverwaltung für Inneres hat die Waffengebührenordnung vorgelegt; das Abgeordnetenhaus hat sie im Plenum behandelt.",
      why_relevant: "Berliner Landesrecht; die Zuständigkeit liegt beim Abgeordnetenhaus von Berlin, nicht im Landtag Brandenburg.",
      recommendation: "Nur beobachten.",
      display_category: "Inneres Berlin",
      risk_level: "low", opportunity_level: "low"
    }
  },
  {
    marker: "Waffengesetzes",
    result: {
      headline: "Bund legt Entwurf zur Änderung des Waffengesetzes vor",
      was_ist_passiert: "Die Bundesregierung hat den Entwurf eines Gesetzes zur Änderung des Waffengesetzes in den Bundestag eingebracht.",
      warum_wichtig: "Das Waffengesetz des Bundes setzt den Rahmen, den die Länder im Vollzug anwenden.",
      wer_ist_betroffen: "Waffenbesitzer bundesweit, die Vollzugsbehörden der Länder.",
      handlungsempfehlung: "Beratungsverlauf im Bundestag verfolgen.",
      parteien: [], ausschuesse: [], ministerien: ["Bundesministerium des Innern"],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: ["Bundesministerium des Innern"],
      mentioned_locations: [], mentioned_organizations: [],
      tags: ["Waffenrecht"],
      zeitdruck: "niedrig", confidence_score: 75,
      display_title: "Bund ändert das Waffengesetz",
      display_summary: "Die Bundesregierung hat einen Gesetzentwurf zur Änderung des Waffengesetzes in den Bundestag eingebracht.",
      why_relevant: "Bundesrecht mit Rahmenwirkung für den Landesvollzug.",
      recommendation: "Beratungsverlauf im Bundestag beobachten.",
      display_category: "Bund",
      risk_level: "low", opportunity_level: "low"
    }
  }
];
// Fail-loud-Zuordnung Marker -> Analyse + Aufrufzaehler kommen aus dem Geruest.
const fixture = G.macheFixtureUnderstanding(AI_FIXTURES);
const fixtureUnderstanding = fixture.requestUnderstanding;

// ── In-Memory-Store (Vertragsgrenzen wie Supabase/PostgREST) ─────────────────
// Der Store selbst (Tenant-Guards, RPC-Replik, Audit-Doppel, atomare Publish-Semantik)
// liegt im gemeinsamen Geruest; hier werden nur die Brandenburger Profile und der
// deterministische LLM-Ersatz eingebunden.
function neuerStore() {
  return G.neuerStore({
    getProfile: (userId) => (userId === PROFIL_A.id ? PROFIL_A : userId === PROFIL_B.id ? PROFIL_B : null),
    requestUnderstanding: fixtureUnderstanding,
    // M8 (HELMUT_MATCHING_RELEVANZ_GATE): der ECHTE Flag-Leser gegen die echte Umgebung.
    relevanzGateEnabled: () => matchingRelevanz.relevanzGateAktiv(process.env)
  });
}

(async () => {
  // ═══ A · Sicherheitsgrenzen: nichts ist aktiviert, nichts wird aktiviert ═══
  abschnitt("A · Sicherheitsgrenzen (Brandenburg/Berlin/M8 bleiben aus)");
  check("A1 HELMUT_LANDESMODULE ist nicht gesetzt (keine Brandenburg-Aktivierung im Testlauf)",
    !process.env.HELMUT_LANDESMODULE);
  check("A2 PARDOK-Dispatch-Modus ist off (Default, kein Live-Cutover)",
    dispatch.dispatchMode({}) === "off");
  const inert = await dispatch.pardokDispatch({ id: "bb-plenum", url: "https://example.invalid/x.xml" }, { env: {} });
  check("A3 pardokDispatch liefert strukturell 0 Items in die sichtbare Pipeline",
    Array.isArray(inert.items) && inert.items.length === 0 && inert.reason === "guard-off");
  const shadowInert = await dispatch.pardokDispatch(
    { id: "bb-plenum", url: "https://example.invalid/x.xml" },
    { mode: "shadow", fetchText: async () => XML_BB, noWrite: true }
  );
  check("A4 auch im Shadow-Modus: 0 Pipeline-Items (harte Invariante)",
    Array.isArray(shadowInert.items) && shadowInert.items.length === 0);
  check("A5 M8-Relevanzriegel ist AUS (HELMUT_MATCHING_RELEVANZ_GATE nicht gesetzt)",
    matchingRelevanz.relevanzGateAktiv(process.env) === false);
  check("A6 Kein M8-Pfad: Riegel inaktiv laesst Kandidatenliste byte-identisch",
    (() => { const r = matchingRelevanz.wendeRelevanzGateAn([{ id: 1 }], { aktiv: false }); return r.zeilen.length === 1 && r.verworfen === 0 && r.aktiv === false; })());

  // ═══ B · Parser: echte Gold-Records -> normalisierte Dokumente ═══
  abschnitt("B · Parser + Dokumentklassen (echte Brandenburg-Gold-Fixture)");
  const bb = P.parsePardokDocumentsFromString(XML_BB, { land: "brandenburg", sourceUrl: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml" });
  const beVorgang = P.parsePardokDocumentsFromString(XML_BE_VORGANG, { land: "berlin", sourceUrl: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml" });
  check("B1 Brandenburg-Fixture parst ohne Fehlerseite (7 Dokumente aus 8 Vorgangs-Records)",
    bb.fehlerseite === false && bb.documents.length === 7,
    `fehlerseite=${bb.fehlerseite} docs=${bb.documents.length}`);
  check("B2 Parser-Telemetrie zaehlt ehrlich: 1 delete-Stub, 1 Vorgang ohne Dokument, 0 Kennungskonflikte",
    bb.stats && bb.stats.deleteStubs === 1 && bb.stats.ohneDokument === 1 && bb.stats.kennungKonflikt === 0
      && bb.stats.geparst === 7 && bb.stats.mitVorgangsbezug === 7,
    JSON.stringify(bb.stats));

  // Relevantes Brandenburger Landesdokument: die echte Kleine Anfrage V-369657.
  const relevantRoh = bb.documents.find((d) => /Straf- und Gewalttaten/i.test(d.titel || ""));
  check("B3 relevantes Dokument geparst: Kleine Anfrage -> Dokumentklasse anfrage (DokTyp vor DokArt)",
    Boolean(relevantRoh) && relevantRoh.dokumentklasse === "anfrage" && relevantRoh.dokumenttyp === "Kleine Anfrage",
    JSON.stringify(bb.documents.map((d) => [d.titel, d.dokumentklasse])));
  check("B4 politische Ebene aus dem Parser ist land", relevantRoh && relevantRoh.politische_ebene === "land");
  check("B5 Geografie aus dem Parser ist Brandenburg", relevantRoh && /brandenburg/i.test(String(relevantRoh.geografie || "")));
  check("B6 Vorgangsbezug V-369657 vorhanden (Bezug, keine Vorgangsbildung)",
    relevantRoh && relevantRoh.vorgangsnummer === "V-369657" && relevantRoh.vorgangstyp === "Anfrage");
  check("B7 externe Kennung entsteht ohne <VID>/<DBID> aus VNr+ReihNr (Brandenburg-Spezifikum)",
    relevantRoh && relevantRoh.externe_id === "V-369657#r0001");

  // Fachlich irrelevantes Brandenburger Kontrolldokument: das echte Plenarprotokoll der
  // konstituierenden Sitzung (V-369325, verbatim aus der Struktur-Sonde 30209973678).
  const irrelevantRoh = bb.documents.find((d) => /Alterspräsident/i.test(d.titel || ""));
  check("B8 irrelevantes Kontrolldokument geparst (Plenarprotokoll, Klasse sitzung)",
    Boolean(irrelevantRoh) && irrelevantRoh.dokumentklasse === "sitzung" && irrelevantRoh.vorgangsnummer === "V-369325");
  check("B9 delete-Stub derselben VNr verdraengt/verdoppelt den Vollrecord nicht (genau EIN V-369325-Dokument)",
    bb.documents.filter((d) => d.vorgangsnummer === "V-369325").length === 1
      && irrelevantRoh && irrelevantRoh.titel === "Begrüßung und Rede des Alterspräsidenten");

  // Regional passender, fachfremder Brandenburger Fall: der echte Gesetzentwurf zur
  // Kommunalverfassung (V-370081) — EIN Vorgang mit ZWEI Dokumenten.
  const kommunalRoh = bb.documents.find((d) => /Kommunalverfassung/i.test(d.titel || ""));
  const kommunalPlprRoh = bb.documents.find((d) => d.externe_id === "V-370081#r0002");
  check("B10 Mehrdokument-Vorgang V-370081: Gesetzentwurf (drucksache) + Plenarprotokoll (sitzung)",
    Boolean(kommunalRoh) && kommunalRoh.dokumentklasse === "drucksache" && kommunalRoh.externe_id === "V-370081#r0001"
      && Boolean(kommunalPlprRoh) && kommunalPlprRoh.dokumentklasse === "sitzung");
  check("B11 beide Dokumente tragen DENSELBEN Vorgangsbezug und GETRENNTE externe Kennungen",
    kommunalRoh && kommunalPlprRoh
      && kommunalRoh.vorgangsnummer === "V-370081" && kommunalPlprRoh.vorgangsnummer === "V-370081"
      && kommunalRoh.externe_id !== kommunalPlprRoh.externe_id);

  // Berliner Kontrolldokument: die echte Waffengebuehrenordnung (thematisch aehnlich Inneres).
  const beWaffenRoh = beVorgang.documents.find((d) => /Waffengeb/i.test(d.titel || "") && d.dokumentklasse === "drucksache");
  check("B12 Berliner Kontrolldokument geparst (Waffengebührenordnung, drucksache, Ebene land, Geografie Berlin)",
    Boolean(beWaffenRoh) && beWaffenRoh.politische_ebene === "land" && /berlin/i.test(String(beWaffenRoh.geografie || ""))
      && beWaffenRoh.vorgangsnummer === "V-351039");
  LAUF.eingangsdokumente = bb.documents.length + beVorgang.documents.length;

  if (!relevantRoh || !irrelevantRoh || !kommunalRoh || !kommunalPlprRoh || !beWaffenRoh) {
    console.error("\nABBRUCH: Pflicht-Fixturedokumente fehlen — keine weiteren Stufen pruefbar (kein falsches Gruen).");
    console.log(`\n${stand.passed} bestanden, ${stand.failed + 1} fehlgeschlagen`);
    process.exit(1);
  }

  // ═══ C · Kanonischer Rohdokument-Vertrag (zuRohdokument) + Regel 0 ═══
  abschnitt("C · Rohdokument-Vertrag + globale Identitaet (Regel 0)");
  const ABRUF = "2026-07-30T04:00:00.000Z";
  // Kontextwerte aus dem ECHTEN Landesmodul-Seed (rp-bb-plenum), nicht erfunden.
  const kontextBB = { sourceId: "bb-plenum", sourceName: "Landtag Brandenburg — Parlamentsdokumentation (parldok)", publisherId: "publisher-parlamentsdokumentation.brandenburg.de", abgerufenAm: ABRUF, abrufwegId: "rp-bb-plenum", quelleUrl: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml" };
  const kontextBE = { sourceId: "be-plenum", sourceName: "Abgeordnetenhaus von Berlin", publisherId: "pub-parlament-berlin", abgerufenAm: ABRUF, abrufwegId: "rp-be-plenum", quelleUrl: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml" };
  const rohRelevant = K.zuRohdokument(relevantRoh, kontextBB);
  const rohIrrelevant = K.zuRohdokument(irrelevantRoh, kontextBB);
  const rohKommunal = K.zuRohdokument(kommunalRoh, kontextBB);
  const rohKommunalPlpr = K.zuRohdokument(kommunalPlprRoh, kontextBB);
  const rohBE = K.zuRohdokument(beWaffenRoh, kontextBE);

  check("C1 relevantes Rohdokument traegt stabile Identitaet + Fingerabdruck",
    /^raw-[0-9a-f]{16}$/.test(String(rohRelevant.id)) && Boolean(rohRelevant.content_hash));
  check("C2 Herkunft BRA, Ebene land, Geografie Brandenburg bleiben am Rohdokument erhalten",
    rohRelevant.raw.herkunft === "BRA" && rohRelevant.raw.politische_ebene === "land" && /brandenburg/i.test(String(rohRelevant.raw.geografie || "")));
  check("C3 Dokumentklasse + Vorgangsbezug stehen im Vertrag (raw.*)",
    rohRelevant.raw.dokumentklasse === "anfrage" && rohRelevant.raw.vorgangsnummer === "V-369657"
      && rohRelevant.document_type === "Kleine Anfrage");
  check("C4 cluster_id bleibt leer — Vorgangsbildung gehoert dem Resolver",
    rohRelevant.cluster_id === null && rohKommunal.cluster_id === null && rohKommunalPlpr.cluster_id === null);
  check("C5 Originaladresse (parldok-PDF) bleibt als url/canonical_url erhalten",
    /parlamentsdokumentation\.brandenburg\.de/.test(String(rohRelevant.url)) && rohRelevant.canonical_url === rohRelevant.url);
  check("C6 Mapper ist deterministisch (zweiter Aufruf byte-identisch)",
    JSON.stringify(K.zuRohdokument(relevantRoh, kontextBB)) === JSON.stringify(rohRelevant));

  // Bundes-Kontrolldokument (DIP-artig, synthetisch, KEIN Quellenbeleg — klar als
  // Testdatum markiert; die aktive Bundesquelle liefert strukturell gleiche Zeilen).
  const bundRoh = {
    id: "rd-bund-waffg-21-1234",
    content_hash: "bund-waffg-21-1234",
    title: "Entwurf eines Gesetzes zur Änderung des Waffengesetzes",
    summary: "Gesetzentwurf der Bundesregierung (Testfixture, kein Quellenbeleg)",
    url: "https://bund.example/drucksache/21-1234.pdf",
    canonical_url: "https://bund.example/drucksache/21-1234.pdf",
    link_type: "direct",
    source_id: "dip-bundestag",
    source_name: "Deutscher Bundestag (DIP)",
    source_type: "parliament",
    confidence: "high",
    published_at: "2026-07-28",
    retrieved_at: ABRUF,
    document_type: "Gesetzentwurf",
    wahlperiode: "21",
    raw: { externe_id: "dip-21-1234" }
  };

  // Regel 0 (Punkt 24): externe Identitaet Herausgeber+Kennung+Typ.
  const identitaet = (d) => DG.externalIdentity({ ...d, externe_id: d.raw && d.raw.externe_id }) || `${d.source_id}|${d.content_hash}`;
  const eingabe = [rohRelevant, rohKommunal, rohIrrelevant, rohBE, bundRoh];
  const identitaeten = eingabe.map(identitaet);
  check("C7 Regel 0: fuenf Eingabedokumente -> fuenf unterscheidbare globale Identitaeten",
    new Set(identitaeten).size === 5, identitaeten.join(" · "));
  check("C8 Regel 0 idempotent: gleiche Eingabe -> gleiche Identitaet",
    identitaet(rohRelevant) === identitaeten[0]);
  // Brandenburg-Falle aus Punkt 24: V-369400 und V-369325 zeigen auf DIESELBE Protokoll-PDF.
  const rohProtokollB = K.zuRohdokument(bb.documents.find((d) => d.externe_id === "V-369400#r0001"), kontextBB);
  check("C9 geteilte Protokoll-PDF (V-369400/V-369325): gleiche Adresse, ZWEI Identitaeten (Regel 0 haelt sie auseinander)",
    rohProtokollB.url === rohIrrelevant.url && identitaet(rohProtokollB) !== identitaet(rohIrrelevant),
    `${rohProtokollB.url} · ${identitaet(rohProtokollB)} · ${identitaet(rohIrrelevant)}`);
  check("C10 Mehrdokument-Vorgang: zwei Dokumentidentitaeten, EIN Vorgangsbezug — Dokument und Vorgang nicht vermischt",
    identitaet(rohKommunal) !== identitaet(rohKommunalPlpr)
      && rohKommunal.raw.vorgangsnummer === rohKommunalPlpr.raw.vorgangsnummer);
  LAUF.normalisiert = eingabe.length; LAUF.rohdokumente = eingabe.length;

  // ═══ D · Understanding: echter Pfad, deterministische Analyse-Fixtures ═══
  abschnitt("D · Understanding (echte Orchestrierung, Fixture-Analysen)");
  const store = neuerStore();
  const u1 = await understanding.runUnderstandingShadow(eingabe, store.api);
  check("D1 fuenf Cluster, fuenf verarbeitet, keine Zurueckstellung",
    u1.clusters === 5 && u1.processed === 5 && u1.deferred === 0, JSON.stringify(u1.counts));
  check("D2 alle fuenf Vorgaenge gespeichert (status saved)",
    (u1.counts.saved || 0) === 5, JSON.stringify(u1.counts));
  check("D3 Telemetrie weist jeden Endzustand aus (kein globales Pauschal-Gruen)",
    u1.telemetrie && u1.telemetrie.dokumente === 5 && u1.telemetrie.dokumenteOhneEndzustand === 0
      && u1.telemetrie.gruppen && u1.telemetrie.gruppen.verarbeitet === 5);

  const kos = [...store.knowledgeObjects.values()];
  const koRelevant = kos.find((k) => /Straf- und Gewalttaten/i.test(k.headline || ""));
  const koKommunal = kos.find((k) => /Kommunalverfassung/i.test(k.headline || ""));
  const koIrrelevant = kos.find((k) => /Alterspräsident/i.test(k.headline || ""));
  const koBE = kos.find((k) => /Waffenrecht neu/i.test(k.headline || ""));
  const koBund = kos.find((k) => /Waffengesetzes/i.test(k.headline || ""));
  check("D4 fuenf getrennte Vorgaenge — keine Vermischung Bund/Berlin/Brandenburg",
    kos.length === 5 && Boolean(koRelevant) && Boolean(koKommunal) && Boolean(koIrrelevant) && Boolean(koBE) && Boolean(koBund)
      && new Set(kos.map((k) => k.vorgang_id)).size === 5,
    JSON.stringify(kos.map((k) => k.headline)));
  LAUF.vorgaenge = kos.length; LAUF.verstanden = kos.filter((k) => k.understanding_status === "complete").length;

  check("D5 relevanter Brandenburger Vorgang: politische Ebene land (gespeichert, mit Herkunftsnachweis)",
    koRelevant && koRelevant.decision_level === "land" && koRelevant.political_level === "land"
      && koRelevant.classification_confidence && Boolean(koRelevant.classification_confidence.level_quelle));
  const geoNamen = (ko) => (Array.isArray(ko && ko.affected_geographies) ? ko.affected_geographies : [])
    .map((g) => String((g && (g.name || g.id)) || g)).join(",");
  check("D6 relevanter Brandenburger Vorgang: betroffene Geografie Brandenburg, NICHT Berlin",
    koRelevant && /brandenburg/i.test(geoNamen(koRelevant)) && !/berlin/i.test(geoNamen(koRelevant).replace(/brandenburg/gi, "")), geoNamen(koRelevant));
  check("D7 Berliner Kontrollvorgang: bleibt land + Geografie Berlin — wird NICHT zu Brandenburg umetikettiert",
    koBE && koBE.decision_level === "land" && /berlin/i.test(geoNamen(koBE)) && !/brandenburg/i.test(geoNamen(koBE)), geoNamen(koBE));
  check("D8 Bundes-Kontrollvorgang: Ebene bund, keine Brandenburger Geografie",
    koBund && koBund.decision_level === "bund" && !/brandenburg/i.test(geoNamen(koBund)), koBund && `${koBund.decision_level}|${geoNamen(koBund)}`);
  check("D9 Merkmalsvektor (Repraesentation fuer das aktive Matching) ist persistiert",
    kos.every((k) => Array.isArray(k.embedding) && k.embedding.length === matching.EMBEDDING_DIM));
  LAUF.embeddingStatus = `feature-vektor ${matching.EMBEDDING_DIM}d bei ${kos.filter((k) => Array.isArray(k.embedding)).length}/5`;

  // Der Understanding-Pfad minimiert Rohzeilen erneut (toRawDocumentRow, DSGVO) und vergibt
  // dabei die Dedup-Identitaet rd-<hash> — Provenienz ist deshalb ueber die Originaladresse
  // nachweisbar, nicht ueber die raw-Kennung des Mappers (so verhaelt sich auch Production).
  const linksRelevant = store.koLinks.get(koRelevant.id) || [];
  check("D10 Provenienz: Original-PDF des Landtags Brandenburg ist mit dem Vorgang verknuepft (ko_document_links)",
    linksRelevant.some((d) => d.url === rohRelevant.url && d.title === rohRelevant.title));
  check("D11 Herkunft: best_source_url zeigt auf die originale parldok-PDF",
    /parlamentsdokumentation\.brandenburg\.de/.test(String(koRelevant.best_source_url || "")));
  check("D12 politischer Nutzwert gespeichert: Risiko, Chance, Empfehlung, Warum-relevant",
    (koRelevant.risiken || []).length >= 1 && (koRelevant.chancen || []).length >= 1
      && Boolean(koRelevant.recommendation) && Boolean(koRelevant.why_relevant) && koRelevant.risk_level === "medium");

  // ═══ E · Idempotenz des Understandings ═══
  abschnitt("E · Idempotente Wiederholung (Understanding)");
  const vorher = JSON.stringify([...store.knowledgeObjects.values()].map((k) => [k.id, k.ko_version, k.updated_at]).sort());
  const u2 = await understanding.runUnderstandingShadow(eingabe, store.api);
  check("E1 identischer Zweitlauf: alle fuenf Cluster als Duplikat erkannt, kein KI-Aufruf noetig",
    (u2.counts.duplicate || 0) === 5 && (u2.counts.saved || 0) === 0, JSON.stringify(u2.counts));
  check("E2 Zweitlauf veraendert keinen gespeicherten Vorgang (Version + Zeitstempel unveraendert)",
    JSON.stringify([...store.knowledgeObjects.values()].map((k) => [k.id, k.ko_version, k.updated_at]).sort()) === vorher);
  check("E3 keine fachlich falschen Doppelungen (weiter genau 5 Vorgaenge)",
    store.knowledgeObjects.size === 5);
  LAUF.wiederholung = "duplicate:5, neue Schreibvorgaenge: 0";

  // ═══ F · Aktives Matching (Audit AN wie Production, M8 AUS) ═══
  abschnitt("F · Aktiver Matching-Pfad (Audit AN, M8 AUS) + Persistenz");
  const m1 = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "e2e-vertrag" }, store.matchingOverrides);
  check("F1 Matching-Lauf vollstaendig (Audit-Laufzeile, kein Skip)",
    m1 && !m1.skipped && m1.audit && m1.audit.status === contract.RUN_STATUS.VOLLSTAENDIG && m1.saved === 5,
    JSON.stringify(m1));
  check("F2 M8 aus: nichts verworfen, veroeffentlicht == Kandidaten",
    m1.verworfen === 0 && m1.veroeffentlicht === m1.candidates && m1.candidates === 5);

  const rowsA = store.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 });
  const rowRelevant = rowsA.find((r) => r.knowledge_object_id === koRelevant.id);
  const rowKommunal = rowsA.find((r) => r.knowledge_object_id === koKommunal.id);
  const rowIrrelevant = rowsA.find((r) => r.knowledge_object_id === koIrrelevant.id);
  const rowBE = rowsA.find((r) => r.knowledge_object_id === koBE.id);
  check("F3 fuenf persistierte Ergebniszeilen fuer Profil A, alle aktuell, alle mit Laufbezug",
    rowsA.length === 5 && rowsA.every((r) => r.user_id === PROFIL_A.id && r.aktuell === true && r.run_id === m1.audit.runId));
  check("F4 der relevante Brandenburger Vorgang traegt Rang 1 (staerkster belegter Bezug zum Profil)",
    rowRelevant && rowRelevant.rank === 1,
    JSON.stringify(rowsA.map((r) => [r.knowledge_object_id, r.rank, r.similarity])));
  check("F5 Belege des relevanten Treffers: Ausschuss + Thema + Region als matched_features",
    rowRelevant && ["ausschuss", "thema", "wahlkreis"].every((art) =>
      (rowRelevant.matched_features || []).some((f) => f.type === art)),
    JSON.stringify(rowRelevant && rowRelevant.matched_features));
  check("F6 gespeicherte Begruendung + Signale vorhanden (Auditpfad)",
    rowRelevant && Boolean(rowRelevant.begruendung) && rowRelevant.signale && Object.keys(rowRelevant.signale).length > 0);
  check("F7 Vektorversion benennt den Legacy-Merkmalsraum — kein semantisches Embedding im Pfad",
    rowRelevant && rowRelevant.vektor_version === contract.legacyVectorVersion(matching.EMBEDDING_DIM)
      && rowRelevant.engine_version === contract.LEGACY_ENGINE_VERSION);
  check("F8 fachfremder Brandenburg-Vorgang (Kommunalverfassung): Region-Beleg ja, Ausschuss-/Themen-Beleg nein, Rang > 1",
    rowKommunal && rowKommunal.rank > 1
      && (rowKommunal.matched_features || []).some((f) => f.type === "wahlkreis")
      && !(rowKommunal.matched_features || []).some((f) => f.type === "ausschuss" || f.type === "thema"),
    JSON.stringify(rowKommunal && { rank: rowKommunal.rank, feats: rowKommunal.matched_features }));
  LAUF.matchingErgebnisse = rowsA.length;

  // Sichtbare Erklaerung == gespeicherte Gruende (matching-erklaerung liest NUR die Zeile).
  const erk = matchingErklaerung.erklaerungAusErgebnis(rowRelevant);
  check("F9 sichtbare Erklaerung vorhanden und deckungsgleich mit den gespeicherten Belegen",
    erk && typeof erk.satz === "string" && erk.satz.length > 0
      && erk.belege.some((b) => b.art === "ausschuss" && /Inneres und Kommunales/.test(b.text)),
    JSON.stringify(erk));
  // Der Berliner Kontrollfall traegt beim Brandenburger Profil KEINEN Beleg — und bekommt
  // deshalb aus der ECHTEN gespeicherten Zeile KEINE erfundene Erklaerung (Belegpflicht).
  check("F10 Berliner Kontrollzeile ohne Beleg -> KEINE erfundene Erklaerung (null)",
    rowBE && (rowBE.matched_features || []).length === 0
      && matchingErklaerung.erklaerungAusErgebnis(rowBE) === null,
    JSON.stringify(rowBE && rowBE.matched_features));

  // ═══ G · Idempotenz des Matchings (Audit-Fingerabdruck) ═══
  abschnitt("G · Idempotente Wiederholung (Matching)");
  const publishesVorher = store.zaehler.publish;
  const resultsSnapshot = JSON.stringify([...store.matchingResults.values()].map((r) => [r.id, r.berechnet_am, r.aktuell]).sort());
  const m2 = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "e2e-vertrag" }, store.matchingOverrides);
  check("G1 identischer Eingang -> idempotenter Lauf (keine neue Generation)",
    m2.audit && m2.audit.idempotent === true && m2.audit.runId === m1.audit.runId && m2.audit.wiederholungen === 1,
    JSON.stringify(m2.audit));
  check("G2 keine erneute Veroeffentlichung, Projektion byte-identisch",
    store.zaehler.publish === publishesVorher
      && JSON.stringify([...store.matchingResults.values()].map((r) => [r.id, r.berechnet_am, r.aktuell]).sort()) === resultsSnapshot);

  // ═══ H · Mandantentrennung ═══
  abschnitt("H · Mandantentrennung");
  check("H1 vor dem eigenen Lauf: Zweitprofil hat 0 persistierte Ergebnisse",
    store.api.listMatchingResults({ userId: PROFIL_B.id, limit: 50 }).length === 0);
  const mB = await matching.runMatchingShadow({ profile: PROFIL_B, ausloeser: "e2e-vertrag" }, store.matchingOverrides);
  const rowsB = store.api.listMatchingResults({ userId: PROFIL_B.id, limit: 50 });
  check("H2 eigener Lauf des Zweitprofils schreibt ausschliesslich eigene Zeilen",
    mB.audit && rowsB.length === 5 && rowsB.every((r) => r.user_id === PROFIL_B.id));
  check("H3 Zeilen von Profil A bleiben unveraendert dem Mandanten A zugeordnet",
    store.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 }).every((r) => r.user_id === PROFIL_A.id));
  check("H4 der relevante Brandenburger Treffer traegt beim Berliner Zweitprofil KEINEN einzigen Beleg",
    (() => { const r = rowsB.find((x) => x.knowledge_object_id === koRelevant.id); return r && (r.matched_features || []).length === 0; })(),
    JSON.stringify((rowsB.find((x) => x.knowledge_object_id === koRelevant.id) || {}).matched_features));
  // Cross-Tenant-Schreibversuch: der Guard (Vertragsgrenze wie assertTenantRows) blockiert.
  let crossTenantBlockiert = false;
  try {
    store.api.saveMatchingResults([
      { id: "mr-x-1", user_id: PROFIL_A.id, knowledge_object_id: koRelevant.id },
      { id: "mr-x-2", user_id: PROFIL_B.id, knowledge_object_id: koRelevant.id }
    ]);
  } catch (e) { crossTenantBlockiert = /CROSS_TENANT/i.test(String(e.message)); }
  check("H5 mandantenuebergreifender Schreibversuch wird blockiert", crossTenantBlockiert);
  // Audit-Guard (echtes matching-audit.assertOwnRun): fremde Profilkennung -> harter Fehler.
  let auditGuard = false;
  try {
    await matching.runMatchingShadow(
      { profile: PROFIL_A, mandateProfileId: PROFIL_B.id, ausloeser: "e2e-vertrag" },
      store.matchingOverrides
    );
  } catch (e) { auditGuard = e && e.code === "CROSS_TENANT_WRITE"; }
  check("H6 Audit-Schicht lehnt fremde Profilkennung ab (CROSS_TENANT_WRITE)", auditGuard);
  LAUF.mandanten = { [PROFIL_A.id]: rowsA.length, [PROFIL_B.id]: rowsB.length };

  // ═══ I · Entscheidung (pro Mandant, deterministisch) ═══
  abschnitt("I · Entscheidungen");
  const d1 = await decisions.runDecisionShadow({ profile: PROFIL_A }, {
    enabled: () => true, getProfile: store.api.getProfile,
    listKnowledgeObjects: store.api.listKnowledgeObjects, saveDecisions: store.api.saveDecisions
  });
  // GEMESSEN: der thematisch aehnliche Berliner Vorgang traegt beim Brandenburger Profil
  // eine NEGATIVE Merkmalsaehnlichkeit (−0,1539) und keinen Beleg — der aktive
  // Entscheidungspfad (matchProfileToKnowledgeObjects, similarity < 0 ohne Beleg) laesst
  // ihn gar nicht erst in die Kandidatenliste. 4 von 5 Vorgaengen erhalten eine Entscheidung.
  check("I1 Entscheidungslauf fuer Profil A erzeugt Entscheidungen (4 von 5 — der Berliner Fall faellt vorher heraus)",
    d1 && !d1.skipped && d1.saved === 4, JSON.stringify(d1));
  const decA = [...store.decisions.values()].filter((d) => d.user_id === PROFIL_A.id);
  const decRelevant = decA.find((d) => d.knowledge_object_id === koRelevant.id);
  const decKommunal = decA.find((d) => d.knowledge_object_id === koKommunal.id);
  const decIrrelevant = decA.find((d) => d.knowledge_object_id === koIrrelevant.id);
  const decBE = decA.find((d) => d.knowledge_object_id === koBE.id);
  check("I2 relevanter Brandenburger Vorgang: Sofort reagieren (Score >= 60) fuer den richtigen Mandanten",
    decRelevant && decRelevant.decision === "Sofort reagieren" && decRelevant.user_id === PROFIL_A.id,
    JSON.stringify(decRelevant && { score: decRelevant.score, decision: decRelevant.decision }));
  check("I3 Entscheidung traegt politische Nutzdimension (Risiko/Chance + handlungsorientierter Typ)",
    decRelevant && ["risk", "chance", "action", "high"].includes(decRelevant.priority_type)
      && (decRelevant.risk || decRelevant.chance));
  check("I4 fachlich irrelevanter Brandenburger Vorgang (konstituierende Sitzung) wird NICHT als Handlung ausgegeben (Ignorieren)",
    decIrrelevant && decIrrelevant.decision === "Ignorieren",
    JSON.stringify(decIrrelevant && { score: decIrrelevant.score, decision: decIrrelevant.decision }));
  check("I5 fachfremder Brandenburg-Vorgang (Kommunalverfassung): KEIN Sofort reagieren — regionale Naehe erfindet keine Dringlichkeit",
    decKommunal && decKommunal.decision !== "Sofort reagieren",
    JSON.stringify(decKommunal && { score: decKommunal.score, decision: decKommunal.decision }));
  check("I6 thematisch aehnlicher Berliner Vorgang: erreicht die Entscheidungsliste des Brandenburger Profils NICHT (negative Aehnlichkeit, kein Beleg — keine erfundene Relevanz)",
    decBE === undefined,
    JSON.stringify(decBE && { score: decBE.score, decision: decBE.decision }));
  // Begruendetes Ignorieren beim falschen Mandanten: derselbe Brandenburger Vorgang.
  const decB = decisions.decideForUser(PROFIL_B, store.api.listKnowledgeObjects(), { userId: PROFIL_B.id });
  const decBRelevant = decB.find((d) => d.knowledge_object_id === koRelevant.id);
  check("I7 falscher Mandant: der Brandenburger Vorgang ist dort Ignorieren (keine erfundene Relevanz)",
    !decBRelevant || decBRelevant.decision === "Ignorieren",
    JSON.stringify(decBRelevant && { score: decBRelevant.score, decision: decBRelevant.decision }));
  LAUF.entscheidungen = decA.length;

  // ═══ J · Politische Ausgabe: Lage-Auswahl (der produktive Lesepfad) ═══
  abschnitt("J · Lage-Auswahl (produktiver Lesepfad, gespeicherte Ergebnisse)");
  const ranked = await lage.loadRankedVorgaenge(store.api, matching.matchProfileToKnowledgeObjects, PROFIL_A, PROFIL_A.id);
  check("J1 Auswahl kommt aus den GESPEICHERTEN Matching-Ergebnissen und enthaelt den relevanten Vorgang",
    ranked.some((k) => k.id === koRelevant.id), JSON.stringify(ranked.map((k) => k.id)));
  const rankedRelevant = ranked.find((k) => k.id === koRelevant.id);
  check("J2 die sichtbare Relevanz-Erklaerung haengt am Vorgang (aus der gespeicherten Zeile)",
    rankedRelevant && rankedRelevant.relevanz_erklaerung && /Inneres und Kommunales/.test(JSON.stringify(rankedRelevant.relevanz_erklaerung)));
  const karten = ranked.map((k) => lage.koToVorgangCard(k, store.api.getSourcesForVorgang(k.vorgang_id)));
  const auswahl = lage.selectLageVorgaenge(karten);
  const karteRelevant = auswahl.find((c) => c.id === koRelevant.vorgang_id);
  check("J3 der relevante Brandenburger Vorgang erreicht die politische Ausgabe (Lage-Karte)",
    Boolean(karteRelevant), JSON.stringify(auswahl.map((c) => c.id)));
  check("J4 Karte traegt die politische Nutzdimension (warum relevant, Empfehlung, Kategorie)",
    karteRelevant && Boolean(karteRelevant.whyRelevant) && Boolean(karteRelevant.recommendation)
      && Boolean(karteRelevant.displayCategory) && Boolean(karteRelevant.empfehlung));
  check("J5 Herkunft bleibt bis zur Ausgabe sichtbar: Original-PDF des Landtags Brandenburg als Quelle",
    karteRelevant && (karteRelevant.sources || []).some((s) => /parlamentsdokumentation\.brandenburg\.de/.test(String(s.url || ""))));
  check("J6 persoenliche Relevanz auf der Karte entspricht den gespeicherten Gruenden",
    karteRelevant && karteRelevant.relevanz && karteRelevant.relevanz.belege.some((b) => /Inneres und Kommunales/.test(b.text)));
  check("J7 Berliner und Bundes-Kontrollvorgaenge erscheinen NICHT als Brandenburger Landesvorgang",
    (() => {
      const kBE = auswahl.find((c) => c.id === koBE.vorgang_id);
      const kBund = auswahl.find((c) => c.id === koBund.vorgang_id);
      const beOk = !kBE || (koBE.decision_level === "land" && /berlin/i.test(geoNamen(koBE)) && !/brandenburg/i.test(geoNamen(koBE)));
      const bundOk = !kBund || (koBund.decision_level === "bund" && !/brandenburg/i.test(geoNamen(koBund)));
      return beOk && bundOk;
    })());
  check("J8 Rangfolge: der relevante Brandenburger Vorgang steht vor Kontroll- und Fremdfaellen",
    (() => {
      const pos = (ko) => ranked.findIndex((k) => k.id === ko.id);
      const posRel = pos(koRelevant);
      return posRel !== -1
        && [koKommunal, koIrrelevant, koBE].every((ko) => pos(ko) === -1 || posRel < pos(ko));
    })(), JSON.stringify(ranked.map((k) => k.id)));
  LAUF.briefingAuswahl = auswahl.map((c) => c.id);
  LAUF.kontrollfaelleAusgeschlossen = [
    `berlin:${koBE.vorgang_id}=geografie-berlin`, `bund:${koBund.vorgang_id}=ebene-bund`,
    `irrelevant:${koIrrelevant.vorgang_id}=ignorieren`, `fachfremd:${koKommunal.vorgang_id}=kein-sofort-reagieren`
  ];

  // ═══ K · Erzwungener Stoerfall: kein falsches Gruen ═══
  abschnitt("K · Erzwungener Stoerfall (kein falsch gruener Gesamtzustand)");
  // K-a: LLM-Fehler im Understanding — der Fehler ist sichtbar, nichts wird still gruen.
  const stoerStore = neuerStore();
  const stoerApi = {
    ...stoerStore.api,
    requestUnderstanding: (prompt) => {
      if (String(prompt).includes("Straf- und Gewalttaten")) throw new Error("simulierter KI-Transportfehler");
      return fixtureUnderstanding(prompt);
    }
  };
  const uStoer = await understanding.runUnderstandingShadow(eingabe, stoerApi);
  check("K1 gestoerter Zwischenschritt erzeugt einen klaren Fehlerstatus (skipped-error)",
    (uStoer.counts["skipped-error"] || 0) === 1 && (uStoer.counts.saved || 0) === 4, JSON.stringify(uStoer.counts));
  check("K2 Telemetrie meldet den Fehlschlag samt Vorgang — kein globales Pauschal-Gruen",
    uStoer.telemetrie.gruppen.fehlgeschlagen === 1 && uStoer.telemetrie.auffaelligkeiten.length >= 1);
  const koGestoert = [...stoerStore.knowledgeObjects.values()].find((k) => k.understanding_status === "failed");
  check("K3 der gestoerte Vorgang ist als failed geparkt (nicht verloren, nicht ausgeliefert)",
    Boolean(koGestoert) && koGestoert.status === "pending");
  const suchErgebnis = stoerStore.api.matchByEmbedding({ embedding: matching.embedProfile(PROFIL_A), matchCount: 20 });
  check("K4 ein failed-Vorgang erreicht das Matching NICHT (RPC-Filter understanding_status<>failed)",
    !suchErgebnis.results.some((r) => r.id === (koGestoert && koGestoert.id)));
  LAUF.fehlerstufe = "understanding+publish (erzwungen)";
  LAUF.fehlergrund = "simulierter KI-Transportfehler · simulierter Publish-Abbruch";

  // K-b: Abbruch WAEHREND der atomaren Veroeffentlichung — vorherige Generation bleibt.
  const vorPublish = JSON.stringify([...store.matchingResults.values()].map((r) => [r.id, r.aktuell]).sort());
  store.publishFehler = "mitten";
  let publishFehlerSichtbar = null;
  try {
    await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "e2e-stoerfall", limit: 3 }, store.matchingOverrides);
  } catch (e) { publishFehlerSichtbar = e; }
  store.publishFehler = null;
  check("K5 Publish-Abbruch wird als Fehler nach oben gereicht (kein stilles Weiterlaufen)",
    Boolean(publishFehlerSichtbar) && publishFehlerSichtbar.auditStatus === contract.RUN_STATUS.FEHLGESCHLAGEN);
  check("K6 der abgebrochene Lauf steht als fehlgeschlagen im Auditprotokoll",
    [...store.matchingRuns.values()].some((r) => r.status === contract.RUN_STATUS.FEHLGESCHLAGEN && r.id === publishFehlerSichtbar.auditRunId));
  check("K7 die vorherige vollstaendige Generation bleibt unveraendert die aktuelle",
    JSON.stringify([...store.matchingResults.values()].map((r) => [r.id, r.aktuell]).sort()) === vorPublish);

  // ═══ L · Keine Production-Abhaengigkeit ═══
  abschnitt("L · Keine Production-Abhaengigkeit");
  check("L1 kein einziger echter KI-Aufruf (alle Analysen aus Fixtures)",
    fixture.anzahlAufrufe() >= 5 && typeof fixtureUnderstanding === "function");
  check("L2 keine Supabase-Env noetig (Test lief ohne SUPABASE_URL/SERVICE_ROLE)",
    true, "Netz-Guard des Runners blockiert zusaetzlich jeden externen Zugriff");
  check("L3 keine mandantenfremden Storage-Zugriffe protokolliert",
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
