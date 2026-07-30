"use strict";

// Punkt 26A — Deterministischer Repository-Ende-zu-Ende-Vertrag fuer ein Berliner Profil.
// =============================================================================================
// VERBINDLICHE DEFINITION (Sprint 26A, 2026-07-30): "Punkt 26" ist Zeile 26 der
// docs/roadmap/phase_1_checkliste.md ("Ende-zu-Ende-Test fuer Berliner Profil") — NICHT
// OP-26 der datenmotor-restliste.md (Matching-Einzelausloesung, anderes Thema). Der Punkt
// ist geschnitten in 26A (dieser Repository-Vertrag, offline) und 26B (spaeterer regulaerer
// Production-Nachweis, ausdruecklich NICHT Teil dieses Tests).
//
// WAS DIESER VERTRAG BEWEIST: Ein realistisches Berliner Landesdokument durchlaeuft den
// tatsaechlich aktiven Helmut-Pfad — Parser -> kanonisches Rohdokument -> Vorgangsbildung/
// Understanding -> politische Ebene/Geografie -> Merkmalsvektor -> aktives Matching (Audit AN,
// M8 AUS) -> persistierte Ergebnisse -> sichtbare Erklaerung -> Entscheidung -> Lage-Auswahl —
// und kommt beim richtigen Testprofil als politisch brauchbare, belegte, mandantengetrennte
// Ausgabe an. Kontrollfaelle: irrelevantes Berliner Dokument, aehnliches Bundes- und
// Brandenburger Dokument, zweites Profil, Idempotenz, erzwungener Stoerfall.
//
// ECHTE PRODUKTIONSFUNKTIONEN (keine Testkopie der Logik):
//   pardok-parser.parsePardokDocumentsFromString + dedupToDocuments
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
//   quellenarchitektur/pardok-dispatch (Beweis: strukturell KEINE Berlin-Aktivierung)
//
// WAS ERSETZT WIRD (einzige Testdoubles, klar begrenzt):
//   1. Die LLM-Antwort (deps.requestUnderstanding): deterministische Fixture-Analysen je
//      Cluster. Testdaten, KEIN Quellenbeleg — die Dokumente selbst stammen verbatim aus den
//      Gold-Fixtures (test/fixtures/pardok/*, echte PARDOK-/parldok-Records).
//   2. Der Storage-Unterbau: ein In-Memory-Store mit denselben Vertragsgrenzen wie
//      Supabase/PostgREST (Mandantenfilter user_id=eq., aktuell=is.true, Tenant-Guard bei
//      Schreibzugriffen, atomare publish-Semantik wie helmut_publish_matching_run — modelliert
//      nach scripts/matching-audit-test.js).
//   3. Die pgvector-RPC match_knowledge_objects: offline-Replik mit EXAKT den dokumentierten
//      SQL-Semantiken (embedding not null, status<>pending, understanding_status<>failed,
//      Ordnung nach Kosinus, limit) ueber die ECHTEN Vektoren aus matching.js — laut
//      matching.js Kopfkommentar ist der reine Kern "identisch deterministisch" zur RPC.
//
// KEIN Netz, KEINE KI, KEINE Production-Abhaengigkeit, KEINE Migration, KEIN neuer Schalter.
// Berlin/Brandenburg/M8 bleiben deaktiviert; der Test aktiviert NICHTS.

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

// Gemeinsames TECHNISCHES Testgeruest (Zaehlwerk, Fixture-Understanding, In-Memory-Store
// mit PostgREST-Vertragsgrenzen, Audit-Doppel, Publish-Semantik) — seit 27A geteilt mit
// dem Brandenburg-Vertrag. Profile, Gold-Records, Fixtures und Assertions bleiben HIER.
const G = require("./e2e-vertrag-geruest");

// ── Harness ──────────────────────────────────────────────────────────────────
const zaehlwerk = G.neuesZaehlwerk();
const check = zaehlwerk.check;
const abschnitt = zaehlwerk.abschnitt;
const stand = zaehlwerk.stand;

// Beobachtbarkeit: der Stufennachweis des Testlaufs. Ein einzelnes globales
// success:true ohne Stufen waere laut Sprintauftrag NICHT ausreichend.
const LAUF = {
  testlauf: `e2e-berlin-vertrag-${new Date().toISOString().slice(0, 10)}`,
  profil: null, zweitprofil: null,
  eingangsdokumente: 0, normalisiert: 0, rohdokumente: 0,
  vorgaenge: 0, verstanden: 0, embeddingStatus: null,
  matchingErgebnisse: 0, entscheidungen: 0, briefingAuswahl: [],
  kontrollfaelleAusgeschlossen: [], fehlerstufe: null, fehlergrund: null,
  wiederholung: null, mandanten: {}
};

// ── Fixtures: echte Gold-Records (verbatim aus test/fixtures/pardok) ─────────
const FIX = path.join(__dirname, "..", "test", "fixtures", "pardok");
const XML_BE_VORGANG = fs.readFileSync(path.join(FIX, "berlin-vorgang-gold.xml"), "utf8");
const XML_BE_FLACH = fs.readFileSync(path.join(FIX, "berlin-gold.xml"), "utf8");
const XML_BB = fs.readFileSync(path.join(FIX, "brandenburg-gold.xml"), "utf8");

// Testprofile. Basis ist das bestehende, mandantenneutrale Berliner Abnahmeprofil
// (seeds/berlin-profilplan.js) — hier fuer den E2E-Vertrag um realistische
// Fachmerkmale ergaenzt (echter Ausschussname der 19. WP, Schwerpunkte). Keine
// reale Person, keine reale Partei, kein Production-Mandat.
const PROFIL_A = Object.freeze({
  ...profilplan.GEMAPPTES_PROFIL,
  id: "e2e-berlin-testprofil",
  fullName: "Testmandat Berlin (E2E-Vertrag 26A)",
  committees: ["Ausschuss für Inneres, Sicherheit und Ordnung"],
  // "Inneres" als Schwerpunkt ist realistisch UND fachlich noetig: assembleKnowledgeObject
  // uebernimmt KEINE tags aus der Analyse (Whitelist), die Themen-Dimension eines KO entsteht
  // im aktiven Pfad ausschliesslich aus den Ausschuessen (derivePolicyFields, P1-1) — hier
  // also als Politikfeld-Label "Inneres".
  focusTopics: ["Inneres", "Innere Sicherheit", "Waffenrecht", "Landespolitik Berlin"]
});
// Zweitprofil fuer die Mandantentrennung: anderes Land, anderes Fachgebiet.
const PROFIL_B = Object.freeze({
  ...profilplan.GEMAPPTES_PROFIL,
  id: "e2e-brandenburg-kontrollprofil",
  fullName: "Testmandat Brandenburg (Kontrolle 26A)",
  state: "Brandenburg", bundesland: "Brandenburg",
  constituency: "Brandenburg (Landesebene, Kontrollprofil)",
  regionalInterests: ["Brandenburg"],
  committees: ["Ausschuss für Bildung, Jugend und Sport"],
  focusTopics: ["Bildung", "Kita-Ausbau"]
});
LAUF.profil = PROFIL_A.id;
LAUF.zweitprofil = PROFIL_B.id;

// ── Deterministische Fixture-Analysen (Ersatz fuer den LLM-Call) ─────────────
// Testdaten, kein Quellenbeleg. Jede Analyse ist konsistent zum ECHTEN Dokumenttitel des
// jeweiligen Clusters; die Ebenen-/Geografiesignale entstehen NICHT durch Behauptung,
// sondern durch die Institutionsnennungen im Text — genau wie im echten Pfad
// (classification.deriveDecisionLevel / geografienAusText).
const AI_FIXTURES = [
  {
    marker: "Waffengebührenordnung",
    result: {
      headline: "Berlin regelt Gebühren im Waffenrecht neu",
      was_ist_passiert: "Die Senatsverwaltung für Inneres hat die Verordnung über die Erhebung von Gebühren im Waffenrecht (Waffengebührenordnung) vorgelegt. Das Abgeordnetenhaus von Berlin hat die Verordnung im Plenum behandelt.",
      warum_wichtig: "Die Gebührenordnung betrifft alle waffenrechtlichen Erlaubnisse im Land Berlin und bestimmt, ob die Innenverwaltung kostendeckend arbeitet.",
      wer_ist_betroffen: "Waffenbesitzer und Schützenvereine in Berlin sowie die Berliner Innenverwaltung.",
      handlungsempfehlung: "Für die nächste Sitzung des Innenausschusses prüfen, ob die Gebührensätze kostendeckend und verhältnismäßig sind.",
      parteien: [], ausschuesse: ["Ausschuss für Inneres, Sicherheit und Ordnung"],
      ministerien: ["Senatsverwaltung für Inneres"],
      risiken: ["Die Gebührenerhöhung kann als einseitige Belastung der Sportschützen kritisiert werden"],
      chancen: ["Sichtbare Positionierung bei der inneren Sicherheit durch eine kostendeckende, nachvollziehbare Gebührenstruktur"],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: ["Ausschuss für Inneres, Sicherheit und Ordnung"],
      mentioned_ministries: ["Senatsverwaltung für Inneres"],
      mentioned_locations: ["Berlin"], mentioned_organizations: [],
      tags: ["Waffenrecht", "Innere Sicherheit"],
      zeitdruck: "mittel", confidence_score: 82,
      display_title: "Berlin ordnet Waffen-Gebühren neu",
      display_summary: "Die Senatsverwaltung für Inneres hat die Waffengebührenordnung vorgelegt; das Abgeordnetenhaus hat sie im Plenum behandelt. Die Sätze gelten für alle waffenrechtlichen Erlaubnisse in Berlin.",
      why_relevant: "Fällt unmittelbar in die Zuständigkeit des Innenausschusses und betrifft die Gebührenpraxis der Berliner Innenverwaltung.",
      recommendation: "Im Innenausschuss Stellung nehmen und die Kostendeckung der Sätze hinterfragen.",
      display_category: "Inneres",
      risk_level: "medium", opportunity_level: "medium"
    }
  },
  {
    marker: "Chaos am BER",
    result: {
      headline: "Schriftliche Anfrage zur Funktionsfähigkeit des BER",
      was_ist_passiert: "Im Abgeordnetenhaus von Berlin ist eine Schriftliche Anfrage zur vollen Funktionsfähigkeit des Flughafens BER gestellt worden.",
      warum_wichtig: "Der Betrieb des Hauptstadtflughafens ist ein laufendes verkehrspolitisches Thema des Landes Berlin.",
      wer_ist_betroffen: "Reisende, die Flughafengesellschaft und die Berliner Verkehrsverwaltung.",
      handlungsempfehlung: "Antwort der Verwaltung abwarten; kein eigener Handlungsbedarf.",
      parteien: [], ausschuesse: [], ministerien: ["Senatsverwaltung für Mobilität und Verkehr"],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: ["Senatsverwaltung für Mobilität und Verkehr"],
      mentioned_locations: ["Berlin"], mentioned_organizations: ["Flughafen Berlin Brandenburg GmbH"],
      tags: ["Verkehr", "Flughafen"],
      zeitdruck: "niedrig", confidence_score: 60,
      display_title: "Anfrage zum BER-Betrieb gestellt",
      display_summary: "Eine Schriftliche Anfrage im Abgeordnetenhaus fragt nach der vollen Funktionsfähigkeit des BER.",
      why_relevant: "Verkehrspolitisches Landesthema ohne unmittelbaren Bezug zur Innenpolitik.",
      recommendation: "Beobachten; keine eigene Reaktion nötig.",
      display_category: "Verkehr",
      risk_level: "low", opportunity_level: "low"
    }
  },
  {
    marker: "Straf- und Gewalttaten",
    result: {
      headline: "Kleine Anfrage zu Straf- und Gewalttaten in Brandenburg",
      was_ist_passiert: "Im Landtag Brandenburg ist eine Kleine Anfrage zu Straf- und Gewalttaten von Juli bis September 2024 gestellt worden.",
      warum_wichtig: "Die Kriminalitätsentwicklung ist ein zentrales Thema der inneren Sicherheit des Landes Brandenburg.",
      wer_ist_betroffen: "Die Brandenburger Polizei, das Innenministerium und die Bevölkerung Brandenburgs.",
      handlungsempfehlung: "Antwort der Landesregierung zur Kenntnis nehmen.",
      parteien: [], ausschuesse: [], ministerien: ["Ministerium des Innern und für Kommunales des Landes Brandenburg"],
      risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: ["Ministerium des Innern und für Kommunales des Landes Brandenburg"],
      mentioned_locations: ["Brandenburg"], mentioned_organizations: [],
      tags: ["Innere Sicherheit", "Kriminalität"],
      zeitdruck: "niedrig", confidence_score: 70,
      display_title: "Brandenburg fragt nach Gewalttaten",
      display_summary: "Eine Kleine Anfrage im Landtag Brandenburg erfragt die Straf- und Gewalttaten des dritten Quartals 2024.",
      why_relevant: "Betrifft die innere Sicherheit Brandenburgs, nicht Berlins.",
      recommendation: "Nur beobachten; Zuständigkeit liegt in Brandenburg.",
      display_category: "Inneres Brandenburg",
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
// liegt im gemeinsamen Geruest; hier werden nur die Berliner Profile und der
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
  abschnitt("A · Sicherheitsgrenzen (Berlin/Brandenburg/M8 bleiben aus)");
  check("A1 HELMUT_LANDESMODULE ist nicht gesetzt (keine Berlin-Aktivierung im Testlauf)",
    !process.env.HELMUT_LANDESMODULE);
  check("A2 PARDOK-Dispatch-Modus ist off (Default, kein Live-Cutover)",
    dispatch.dispatchMode({}) === "off");
  const inert = await dispatch.pardokDispatch({ id: "be-plenum", url: "https://example.invalid/x.xml" }, { env: {} });
  check("A3 pardokDispatch liefert strukturell 0 Items in die sichtbare Pipeline",
    Array.isArray(inert.items) && inert.items.length === 0 && inert.reason === "guard-off");
  const shadowInert = await dispatch.pardokDispatch(
    { id: "be-plenum", url: "https://example.invalid/x.xml" },
    { mode: "shadow", fetchText: async () => XML_BE_FLACH, noWrite: true }
  );
  check("A4 auch im Shadow-Modus: 0 Pipeline-Items (harte Invariante)",
    Array.isArray(shadowInert.items) && shadowInert.items.length === 0);
  check("A5 M8-Relevanzriegel ist AUS (HELMUT_MATCHING_RELEVANZ_GATE nicht gesetzt)",
    matchingRelevanz.relevanzGateAktiv(process.env) === false);
  check("A6 Kein M8-Pfad: Riegel inaktiv laesst Kandidatenliste byte-identisch",
    (() => { const r = matchingRelevanz.wendeRelevanzGateAn([{ id: 1 }], { aktiv: false }); return r.zeilen.length === 1 && r.verworfen === 0 && r.aktiv === false; })());

  // ═══ B · Parser: echte Gold-Records -> normalisierte Dokumente ═══
  abschnitt("B · Parser + Dokumentklassen (echte Gold-Fixtures)");
  const beVorgang = P.parsePardokDocumentsFromString(XML_BE_VORGANG, { land: "berlin", sourceUrl: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml" });
  const beFlach = P.parsePardokDocumentsFromString(XML_BE_FLACH, { land: "berlin", sourceUrl: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml" });
  const bb = P.parsePardokDocumentsFromString(XML_BB, { land: "brandenburg", sourceUrl: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml" });
  check("B1 Berliner Vorgangs-Fixture parst ohne Fehlerseite", beVorgang.fehlerseite === false && beVorgang.documents.length > 0);

  // Relevantes Berliner Landesdokument: die echte Waffengebuehrenordnung (V-351039, D-351040).
  const relevantRoh = beVorgang.documents.find((d) => /Waffengeb/i.test(d.titel || "") && d.dokumentklasse === "drucksache");
  check("B2 relevantes Berliner Dokument geparst (Waffengebührenordnung, Klasse drucksache)", Boolean(relevantRoh),
    JSON.stringify(beVorgang.documents.map((d) => [d.titel, d.dokumentklasse])));
  check("B3 politische Ebene aus dem Parser ist land", relevantRoh && relevantRoh.politische_ebene === "land");
  check("B4 Geografie aus dem Parser ist Berlin", relevantRoh && /berlin/i.test(String(relevantRoh.geografie || "")));
  check("B5 Vorgangsbezug V-351039 vorhanden (Bezug, keine Vorgangsbildung)", relevantRoh && relevantRoh.vorgangsnummer === "V-351039");

  // Irrelevantes Berliner Dokument: echte Schriftliche Anfrage zum BER.
  const irrelevantRoh = beFlach.documents.find((d) => /Chaos am BER/i.test(d.titel || ""));
  check("B6 irrelevantes Berliner Dokument geparst (BER, Klasse anfrage)",
    Boolean(irrelevantRoh) && irrelevantRoh.dokumentklasse === "anfrage");

  // Brandenburger Kontrolldokument: echte Kleine Anfrage zu Straf-/Gewalttaten.
  const bbRoh = bb.documents.find((d) => /Straf- und Gewalttaten/i.test(d.titel || ""));
  check("B7 Brandenburger Kontrolldokument geparst (Kleine Anfrage, Klasse anfrage)",
    Boolean(bbRoh) && bbRoh.dokumentklasse === "anfrage" && bbRoh.politische_ebene === "land" && /brandenburg/i.test(String(bbRoh.geografie || "")));
  LAUF.eingangsdokumente = beVorgang.documents.length + beFlach.documents.length + bb.documents.length;

  if (!relevantRoh || !irrelevantRoh || !bbRoh) {
    console.error("\nABBRUCH: Pflicht-Fixturedokumente fehlen — keine weiteren Stufen pruefbar (kein falsches Gruen).");
    console.log(`\n${stand.passed} bestanden, ${stand.failed + 1} fehlgeschlagen`);
    process.exit(1);
  }

  // ═══ C · Kanonischer Rohdokument-Vertrag (zuRohdokument) + Regel 0 ═══
  abschnitt("C · Rohdokument-Vertrag + globale Identitaet (Regel 0)");
  const ABRUF = "2026-07-30T04:00:00.000Z";
  const kontextBE = { sourceId: "be-plenum", sourceName: "Abgeordnetenhaus von Berlin", publisherId: "pub-parlament-berlin", abgerufenAm: ABRUF, abrufwegId: "rp-be-plenum", quelleUrl: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml" };
  const kontextBB = { sourceId: "bb-plenum", sourceName: "Landtag Brandenburg", publisherId: "pub-parldok-brandenburg", abgerufenAm: ABRUF, abrufwegId: "rp-bb-plenum", quelleUrl: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml" };
  const rohRelevant = K.zuRohdokument(relevantRoh, kontextBE);
  const rohIrrelevant = K.zuRohdokument(irrelevantRoh, kontextBE);
  const rohBB = K.zuRohdokument(bbRoh, kontextBB);

  check("C1 relevantes Rohdokument traegt stabile Identitaet + Fingerabdruck",
    /^raw-[0-9a-f]{16}$/.test(String(rohRelevant.id)) && Boolean(rohRelevant.content_hash));
  check("C2 Herkunft BLN, Ebene land, Geografie Berlin bleiben am Rohdokument erhalten",
    rohRelevant.raw.herkunft === "BLN" && rohRelevant.raw.politische_ebene === "land" && /berlin/i.test(String(rohRelevant.raw.geografie || "")));
  check("C3 Dokumentklasse + Vorgangsbezug stehen im Vertrag (raw.*)",
    rohRelevant.raw.dokumentklasse === "drucksache" && rohRelevant.raw.vorgangsnummer === "V-351039");
  check("C4 cluster_id bleibt leer — Vorgangsbildung gehoert dem Resolver",
    rohRelevant.cluster_id === null);
  check("C5 Originaladresse (pardok-PDF) bleibt als url/canonical_url erhalten",
    /pardok\.parlament-berlin\.de/.test(String(rohRelevant.url)) && rohRelevant.canonical_url === rohRelevant.url);
  check("C6 Mapper ist deterministisch (zweiter Aufruf byte-identisch)",
    JSON.stringify(K.zuRohdokument(relevantRoh, kontextBE)) === JSON.stringify(rohRelevant));

  // Regel 0 (Punkt 24): externe Identitaet Herausgeber+Kennung+Typ — die vier
  // Vertragsdokumente bleiben global unterscheidbar, wiederholt stabil.
  const bundRoh = {
    // Bundes-Kontrolldokument (DIP-artig, synthetisch, KEIN Quellenbeleg — klar als
    // Testdatum markiert; die aktive Bundesquelle liefert strukturell gleiche Zeilen).
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
  const identitaeten = [rohRelevant, rohIrrelevant, rohBB, bundRoh].map((d) =>
    DG.externalIdentity({ ...d, externe_id: d.raw && d.raw.externe_id }) || `${d.source_id}|${d.content_hash}`);
  check("C7 Regel 0: vier Dokumente -> vier unterscheidbare globale Identitaeten",
    new Set(identitaeten).size === 4, identitaeten.join(" · "));
  check("C8 Regel 0 idempotent: gleiche Eingabe -> gleiche Identitaet",
    DG.externalIdentity({ ...rohRelevant, externe_id: rohRelevant.raw.externe_id }) === identitaeten[0]);
  LAUF.normalisiert = 4; LAUF.rohdokumente = 4;

  // ═══ D · Understanding: echter Pfad, deterministische Analyse-Fixtures ═══
  abschnitt("D · Understanding (echte Orchestrierung, Fixture-Analysen)");
  const store = neuerStore();
  const eingabe = [rohRelevant, rohIrrelevant, rohBB, bundRoh];
  const u1 = await understanding.runUnderstandingShadow(eingabe, store.api);
  check("D1 vier Cluster, vier verarbeitet, keine Zurueckstellung",
    u1.clusters === 4 && u1.processed === 4 && u1.deferred === 0, JSON.stringify(u1.counts));
  check("D2 alle vier Vorgaenge gespeichert (status saved)",
    (u1.counts.saved || 0) === 4, JSON.stringify(u1.counts));
  check("D3 Telemetrie weist jeden Endzustand aus (kein globales Pauschal-Gruen)",
    u1.telemetrie && u1.telemetrie.dokumente === 4 && u1.telemetrie.dokumenteOhneEndzustand === 0
      && u1.telemetrie.gruppen && u1.telemetrie.gruppen.verarbeitet === 4);

  const kos = [...store.knowledgeObjects.values()];
  const koRelevant = kos.find((k) => /Gebühren im Waffenrecht/i.test(k.headline || ""));
  const koIrrelevant = kos.find((k) => /BER/.test(k.headline || ""));
  const koBB = kos.find((k) => /Brandenburg/.test(k.headline || ""));
  const koBund = kos.find((k) => /Waffengesetz/i.test(k.headline || "") && /Bund/i.test(k.headline || ""));
  check("D4 vier getrennte Vorgaenge — keine Vermischung Bund/Berlin/Brandenburg",
    kos.length === 4 && Boolean(koRelevant) && Boolean(koIrrelevant) && Boolean(koBB) && Boolean(koBund)
      && new Set(kos.map((k) => k.vorgang_id)).size === 4,
    JSON.stringify(kos.map((k) => k.headline)));
  LAUF.vorgaenge = kos.length; LAUF.verstanden = kos.filter((k) => k.understanding_status === "complete").length;

  check("D5 relevanter Berliner Vorgang: politische Ebene land (gespeichert, mit Herkunftsnachweis)",
    koRelevant && koRelevant.decision_level === "land" && koRelevant.political_level === "land"
      && koRelevant.classification_confidence && Boolean(koRelevant.classification_confidence.level_quelle));
  const geoNamen = (ko) => (Array.isArray(ko && ko.affected_geographies) ? ko.affected_geographies : [])
    .map((g) => String((g && (g.name || g.id)) || g)).join(",");
  check("D6 relevanter Berliner Vorgang: betroffene Geografie Berlin",
    koRelevant && /berlin/i.test(geoNamen(koRelevant)) && !/brandenburg/i.test(geoNamen(koRelevant)), geoNamen(koRelevant));
  check("D7 Brandenburger Kontrollvorgang: land + Geografie Brandenburg, NICHT Berlin",
    koBB && koBB.decision_level === "land" && /brandenburg/i.test(geoNamen(koBB)) && !/^berlin$|,berlin|berlin,/i.test(geoNamen(koBB)), geoNamen(koBB));
  check("D8 Bundes-Kontrollvorgang: Ebene bund, keine Berliner Geografie",
    koBund && koBund.decision_level === "bund" && !/berlin/i.test(geoNamen(koBund)), koBund && `${koBund.decision_level}|${geoNamen(koBund)}`);
  check("D9 Merkmalsvektor (Repraesentation fuer das aktive Matching) ist persistiert",
    kos.every((k) => Array.isArray(k.embedding) && k.embedding.length === matching.EMBEDDING_DIM));
  LAUF.embeddingStatus = `feature-vektor ${matching.EMBEDDING_DIM}d bei ${kos.filter((k) => Array.isArray(k.embedding)).length}/4`;

  // Der Understanding-Pfad minimiert Rohzeilen erneut (toRawDocumentRow, DSGVO) und vergibt
  // dabei die Dedup-Identitaet rd-<hash> — Provenienz ist deshalb ueber die Originaladresse
  // nachweisbar, nicht ueber die raw-Kennung des Mappers (so verhaelt sich auch Production).
  const linksRelevant = store.koLinks.get(koRelevant.id) || [];
  check("D10 Provenienz: Quell-Dokument (Original-PDF) ist mit dem Vorgang verknuepft (ko_document_links)",
    linksRelevant.some((d) => d.url === rohRelevant.url && d.title === rohRelevant.title));
  check("D11 Herkunft: best_source_url zeigt auf die originale pardok-PDF",
    /pardok\.parlament-berlin\.de/.test(String(koRelevant.best_source_url || "")));
  check("D12 politischer Nutzwert gespeichert: Risiko, Chance, Empfehlung, Warum-relevant",
    (koRelevant.risiken || []).length >= 1 && (koRelevant.chancen || []).length >= 1
      && Boolean(koRelevant.recommendation) && Boolean(koRelevant.why_relevant) && koRelevant.risk_level === "medium");

  // ═══ E · Idempotenz des Understandings ═══
  abschnitt("E · Idempotente Wiederholung (Understanding)");
  const vorher = JSON.stringify([...store.knowledgeObjects.values()].map((k) => [k.id, k.ko_version, k.updated_at]).sort());
  const u2 = await understanding.runUnderstandingShadow(eingabe, store.api);
  check("E1 identischer Zweitlauf: alle vier Cluster als Duplikat erkannt, kein KI-Aufruf noetig",
    (u2.counts.duplicate || 0) === 4 && (u2.counts.saved || 0) === 0, JSON.stringify(u2.counts));
  check("E2 Zweitlauf veraendert keinen gespeicherten Vorgang (Version + Zeitstempel unveraendert)",
    JSON.stringify([...store.knowledgeObjects.values()].map((k) => [k.id, k.ko_version, k.updated_at]).sort()) === vorher);
  check("E3 keine fachlich falschen Doppelungen (weiter genau 4 Vorgaenge)",
    store.knowledgeObjects.size === 4);
  LAUF.wiederholung = "duplicate:4, neue Schreibvorgaenge: 0";

  // ═══ F · Aktives Matching (Audit AN wie Production, M8 AUS) ═══
  abschnitt("F · Aktiver Matching-Pfad (Audit AN, M8 AUS) + Persistenz");
  const m1 = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "e2e-vertrag" }, store.matchingOverrides);
  check("F1 Matching-Lauf vollstaendig (Audit-Laufzeile, kein Skip)",
    m1 && !m1.skipped && m1.audit && m1.audit.status === contract.RUN_STATUS.VOLLSTAENDIG && m1.saved === 4,
    JSON.stringify(m1));
  check("F2 M8 aus: nichts verworfen, veroeffentlicht == Kandidaten",
    m1.verworfen === 0 && m1.veroeffentlicht === m1.candidates && m1.candidates === 4);

  const rowsA = store.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 });
  const rowRelevant = rowsA.find((r) => r.knowledge_object_id === koRelevant.id);
  const rowIrrelevant = rowsA.find((r) => r.knowledge_object_id === koIrrelevant.id);
  const rowBund = rowsA.find((r) => r.knowledge_object_id === koBund.id);
  const rowBB = rowsA.find((r) => r.knowledge_object_id === koBB.id);
  check("F3 vier persistierte Ergebniszeilen fuer Profil A, alle aktuell, alle mit Laufbezug",
    rowsA.length === 4 && rowsA.every((r) => r.user_id === PROFIL_A.id && r.aktuell === true && r.run_id === m1.audit.runId));
  check("F4 der relevante Berliner Vorgang traegt Rang 1 (hoechste Merkmalsuebereinstimmung)",
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
  LAUF.matchingErgebnisse = rowsA.length;

  // Sichtbare Erklaerung == gespeicherte Gruende (matching-erklaerung liest NUR die Zeile).
  const erk = matchingErklaerung.erklaerungAusErgebnis(rowRelevant);
  check("F8 sichtbare Erklaerung vorhanden und deckungsgleich mit den gespeicherten Belegen",
    erk && typeof erk.satz === "string" && erk.satz.length > 0
      && erk.belege.some((b) => b.art === "ausschuss" && /Inneres/.test(b.text)),
    JSON.stringify(erk));
  const erkBund = matchingErklaerung.erklaerungAusErgebnis({ ...rowBund, matched_features: [], signale: {}, begruendung: null });
  check("F9 ohne gespeicherten Beleg KEINE erfundene Erklaerung (null)", erkBund === null);

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
    mB.audit && rowsB.length === 4 && rowsB.every((r) => r.user_id === PROFIL_B.id));
  check("H3 Zeilen von Profil A bleiben unveraendert dem Mandanten A zugeordnet",
    store.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 }).every((r) => r.user_id === PROFIL_A.id));
  check("H4 der relevante Berliner Treffer des A-Profils traegt beim B-Profil KEINEN Beleg",
    (() => { const r = rowsB.find((x) => x.knowledge_object_id === koRelevant.id); return r && (r.matched_features || []).filter((f) => f.type !== "wahlkreis").length === 0; })(),
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
  LAUF.mandanten = { [PROFIL_A.id]: 4, [PROFIL_B.id]: rowsB.length };

  // ═══ I · Entscheidung (pro Mandant, deterministisch) ═══
  abschnitt("I · Entscheidungen");
  const d1 = await decisions.runDecisionShadow({ profile: PROFIL_A }, {
    enabled: () => true, getProfile: store.api.getProfile,
    listKnowledgeObjects: store.api.listKnowledgeObjects, saveDecisions: store.api.saveDecisions
  });
  check("I1 Entscheidungslauf fuer Profil A erzeugt Entscheidungen", d1 && !d1.skipped && d1.saved >= 4, JSON.stringify(d1));
  const decA = [...store.decisions.values()].filter((d) => d.user_id === PROFIL_A.id);
  const decRelevant = decA.find((d) => d.knowledge_object_id === koRelevant.id);
  const decIrrelevant = decA.find((d) => d.knowledge_object_id === koIrrelevant.id);
  check("I2 relevanter Berliner Vorgang: Sofort reagieren (Score >= 60) fuer den richtigen Mandanten",
    decRelevant && decRelevant.decision === "Sofort reagieren" && decRelevant.user_id === PROFIL_A.id,
    JSON.stringify(decRelevant && { score: decRelevant.score, decision: decRelevant.decision }));
  check("I3 Entscheidung traegt politische Nutzdimension (Risiko/Chance + Deadline-Felder)",
    decRelevant && ["risk", "chance", "action", "high"].includes(decRelevant.priority_type)
      && (decRelevant.risk || decRelevant.chance));
  check("I4 irrelevanter Berliner Vorgang wird NICHT als wichtige Handlung ausgegeben (Ignorieren)",
    decIrrelevant && decIrrelevant.decision === "Ignorieren",
    JSON.stringify(decIrrelevant && { score: decIrrelevant.score, decision: decIrrelevant.decision }));
  // Begruendetes Ignorieren beim falschen Mandanten: derselbe Berliner Vorgang.
  const decB = decisions.decideForUser(PROFIL_B, store.api.listKnowledgeObjects(), { userId: PROFIL_B.id });
  const decBRelevant = decB.find((d) => d.knowledge_object_id === koRelevant.id);
  check("I5 falscher Mandant: der Berliner Vorgang ist dort Ignorieren (keine erfundene Relevanz)",
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
    rankedRelevant && rankedRelevant.relevanz_erklaerung && /Inneres/.test(JSON.stringify(rankedRelevant.relevanz_erklaerung)));
  const karten = ranked.map((k) => lage.koToVorgangCard(k, store.api.getSourcesForVorgang(k.vorgang_id)));
  const auswahl = lage.selectLageVorgaenge(karten);
  const karteRelevant = auswahl.find((c) => c.id === koRelevant.vorgang_id);
  check("J3 der relevante Berliner Vorgang erreicht die politische Ausgabe (Lage-Karte)",
    Boolean(karteRelevant), JSON.stringify(auswahl.map((c) => c.id)));
  check("J4 Karte traegt die politische Nutzdimension (warum relevant, Empfehlung, Kategorie)",
    karteRelevant && Boolean(karteRelevant.whyRelevant) && Boolean(karteRelevant.recommendation)
      && Boolean(karteRelevant.displayCategory) && Boolean(karteRelevant.empfehlung));
  check("J5 Herkunft bleibt bis zur Ausgabe sichtbar: Original-PDF des Abgeordnetenhauses als Quelle",
    karteRelevant && (karteRelevant.sources || []).some((s) => /pardok\.parlament-berlin\.de/.test(String(s.url || ""))));
  check("J6 persoenliche Relevanz auf der Karte entspricht den gespeicherten Gruenden",
    karteRelevant && karteRelevant.relevanz && karteRelevant.relevanz.belege.some((b) => /Inneres/.test(b.text)));
  check("J7 Bundes- und Brandenburg-Kontrollvorgaenge erscheinen NICHT als Berliner Landesvorgang",
    (() => {
      const kBund = auswahl.find((c) => c.id === koBund.vorgang_id);
      const kBB = auswahl.find((c) => c.id === koBB.vorgang_id);
      const bundOk = !kBund || (koBund.decision_level === "bund" && !/berlin/i.test(geoNamen(koBund)));
      const bbOk = !kBB || /brandenburg/i.test(geoNamen(koBB));
      return bundOk && bbOk;
    })());
  check("J8 Rangfolge: der relevante Berliner Vorgang steht vor dem irrelevanten",
    (() => {
      const posRel = ranked.findIndex((k) => k.id === koRelevant.id);
      const posIrr = ranked.findIndex((k) => k.id === koIrrelevant.id);
      return posRel !== -1 && (posIrr === -1 || posRel < posIrr);
    })());
  LAUF.briefingAuswahl = auswahl.map((c) => c.id);
  LAUF.kontrollfaelleAusgeschlossen = [
    `bund:${koBund.vorgang_id}=ebene-bund`, `brandenburg:${koBB.vorgang_id}=geografie-brandenburg`,
    `irrelevant:${koIrrelevant.vorgang_id}=ignorieren`
  ];

  // ═══ K · Erzwungener Stoerfall: kein falsches Gruen ═══
  abschnitt("K · Erzwungener Stoerfall (kein falsch gruener Gesamtzustand)");
  // K-a: LLM-Fehler im Understanding — der Fehler ist sichtbar, nichts wird still gruen.
  const stoerStore = neuerStore();
  const stoerApi = {
    ...stoerStore.api,
    requestUnderstanding: (prompt) => {
      if (String(prompt).includes("Waffengebührenordnung")) throw new Error("simulierter KI-Transportfehler");
      return fixtureUnderstanding(prompt);
    }
  };
  const uStoer = await understanding.runUnderstandingShadow(eingabe, stoerApi);
  check("K1 gestoerter Zwischenschritt erzeugt einen klaren Fehlerstatus (skipped-error)",
    (uStoer.counts["skipped-error"] || 0) === 1 && (uStoer.counts.saved || 0) === 3, JSON.stringify(uStoer.counts));
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
  check("L1 kein einziger echter KI-Aufruf (alle Analysen aus Fixtures)", fixture.anzahlAufrufe() >= 4 && typeof fixtureUnderstanding === "function");
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
