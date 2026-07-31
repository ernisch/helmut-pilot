"use strict";

// Rezeptversion legacy_relevance_v1 -> v2 — Nachweisvertrag (Befund B25-2).
// ===========================================================================
// WARUM DIESE ANHEBUNG: Die Zulaessigkeitsregel fuer Ausschussbelege
// (`matching.ausschussBelegZulaessig`, Befund 27A-2 / PR #185) wurde symmetrisch
// verschaerft. Seither erzeugt DIESELBE Eingabe ein ANDERES Ergebnis
// (matched_features, Signale, Begruendung, Entscheidungsgewicht 34). Nach der
// Definition der Versionsachse in `matching-contract.js` ("rezept_version = NACH
// WELCHER Regel: Merkmale, Gewichte, Auswahl") ist das eine Rezeptaenderung.
//
// Sie war in PR #185 nicht nachgezogen worden. Folge (Befund B25-2, belegt in
// docs/roadmap/punkt-25-e2e-nachweis.md §6c): `matched_features` gehen bewusst
// NICHT in den Eingabefingerabdruck ein — bestehende, vor dem Fix gerechnete
// Zeilen wurden deshalb nie neu berechnet und tragen weiterhin falsche
// Ausschussbelege. Die Anhebung ist der vom Vertrag vorgesehene Hebel dafuer.
//
// ABGRENZUNG zur Gegenentscheidung in docs/matching-nachvollziehbarkeit.md §36
// (Erklaerungsabdeckung, Befund M-7): dort rechnete das Rezept nach dem Fix
// exakt wie vorher und bekam nur seinen tatsaechlichen Eingang zu sehen — eine
// Anhebung waere dort eine FALSCHE Aussage im Auditprotokoll gewesen. Hier ist
// es umgekehrt.
//
// BEWEISFUEHRUNG an den ECHTEN Produktionsfunktionen (matching.runMatchingShadow
// mit echtem matching-audit, Testdouble nur am Storage-Rand — gemeinsames
// Geruest scripts/e2e-vertrag-geruest.js wie 25A/26A/27A):
//   1. Die neue Rezeptversion veraendert den Eingabefingerabdruck.
//   2. Bestehende Ergebnisse werden beim naechsten regulaeren Lauf neu berechnet.
//   3. Die Ausschussbelege folgen der korrigierten Zulaessigkeitslogik.
//   4. Ein identischer Folgelauf bleibt anschliessend wieder idempotent.
//   5. Es entsteht keine Regression fuer andere Mandanten.
//
// KEIN Netz, KEINE KI, KEINE Production-Secrets, KEIN Production-Zugriff,
// KEIN manueller Lauf, KEIN Backfill. Mandantenneutral: zwei kuenstliche
// Bundesprofile, kein Pilotmandant, keine Sonderbehandlung.

const matching = require("../lib/helmut/matching");
const contract = require("../lib/helmut/matching-contract");
const matchingRelevanz = require("../lib/helmut/matching-relevanz");
const G = require("./e2e-vertrag-geruest");

const { check, abschnitt, stand } = G.neuesZaehlwerk();
const j = (v) => JSON.stringify(v);

// Der ECHTE, ab jetzt produktive Wert — einmal festgehalten, damit die
// Simulation des Altstands ihn zuverlaessig wiederherstellt.
const V2 = contract.LEGACY_RECIPE_VERSION;
const V1 = "legacy_relevance_v1";

// ── Fixtures (kuenstlich, keine echte Person, kein echtes Mandat) ────────────
const PROFIL_A = Object.freeze({
  id: "rv2-mandat-a", fullName: "Testmandat Bund A", party: "SPD", faction: "SPD",
  politicalLevel: "Bund", parliamentType: "Bundestag", state: "Niedersachsen",
  constituency: "Wahlkreis 50", committees: ["Ausschuss für Arbeit und Soziales"],
  // "Arbeit und Soziales" ist bewusst als Schwerpunkt gesetzt: nur dann ist die
  // Aussage aus Befund 27A-2 pruefbar, dass beim Wegfall des Ausschussbelegs der
  // FACHLICHE Bezug ueber das abgeleitete Politikfeld (`thema`) erhalten bleibt.
  focusTopics: ["Rente", "Arbeitsmarkt", "Arbeit und Soziales"], regionalInterests: ["Salzgitter"],
  profileActive: true
});
const PROFIL_B = Object.freeze({
  id: "rv2-mandat-b", fullName: "Testmandat Bund B", party: "CDU",
  politicalLevel: "Bund", parliamentType: "Bundestag", state: "Bayern",
  constituency: "Wahlkreis 217", committees: ["Ausschuss für Inneres und Heimat"],
  focusTopics: ["Innere Sicherheit"], regionalInterests: ["München"],
  profileActive: true
});

const geo = (name, id) => ({ name, level: "land", geography_id: id, herkunft: "inhalt" });
function ko(id, o) {
  const roh = {
    id, vorgang_id: `vg-${id}`, ko_version: 1, status: "neu", understanding_status: "complete",
    headline: o.headline, was_ist_passiert: o.text, warum_wichtig: o.text,
    parteien: o.parteien || [], mentioned_parties: o.parteien || [],
    ausschuesse: o.ausschuesse || [], mentioned_committees: o.ausschuesse || [],
    mentioned_locations: o.orte || [],
    affected_geographies: o.geo || [], mentioned_geographies: o.geo || [],
    decision_level: o.ebene || "unknown", tags: [], policy_field: []
  };
  // Merkmalsvektor write-time wie in Production (assembleKnowledgeObject).
  roh.embedding = matching.embedKnowledgeObject(roh);
  return roh;
}

// Der fachliche Kern des Befunds 27A-2: derselbe Ausschuss-STAMM
// ("arbeit-und-soziales") auf Bundes- und auf Landesebene.
const KO_BUND_AUSSCHUSS = ko("bund-soziales", {
  headline: "Bundestag berät das Rentenpaket", ebene: "bund",
  ausschuesse: ["Ausschuss für Arbeit und Soziales"], parteien: ["SPD"],
  text: "Der Bundestag berät das Rentenpaket zur Alterssicherung."
});
const KO_LAND_AUSSCHUSS = ko("land-bayern-soziales", {
  headline: "Bayern ändert das Sozialgesetz", ebene: "land",
  geo: [geo("Bayern", "geo-land-bayern")], orte: ["München"],
  ausschuesse: ["Ausschuss für Arbeit und Soziales"],
  text: "Der Landtag Bayern berät das Sozialgesetz zur Alterssicherung."
});
const KO_BUND_INNERES = ko("bund-inneres", {
  headline: "Bund ändert das Waffengesetz", ebene: "bund",
  ausschuesse: ["Ausschuss für Inneres und Heimat"],
  text: "Die Bundesregierung legt einen Entwurf zur inneren Sicherheit vor."
});
const ALLE_KOS = [KO_BUND_AUSSCHUSS, KO_LAND_AUSSCHUSS, KO_BUND_INNERES];

function neuerStore() {
  const st = G.neuerStore({
    getProfile: (u) => (u === PROFIL_A.id ? PROFIL_A : u === PROFIL_B.id ? PROFIL_B : null),
    requestUnderstanding: () => { throw new Error("kein KI-Aufruf in diesem Vertrag"); },
    relevanzGateEnabled: () => matchingRelevanz.relevanzGateAktiv(process.env)
  });
  // Laufkennungen EINDEUTIG machen. Das gemeinsame Geruest verwendet einen festen
  // Zufallsanteil; zusammen mit der Sekundenaufloesung der Kennung tragen mehrere
  // Laeufe derselben Sekunde dieselbe Kennung und ueberschreiben sich in der
  // Laufablage. In Production ist der Anteil echter Zufall (4 Byte) und die
  // Laufhistorie append-only — dieser Vertrag prueft genau diese Historie
  // (Rueckweg, Abschnitt H). Deterministisch, nur eindeutig.
  let laufNr = 0;
  st.auditDeps.randomSuffix = () => `rv2lauf${++laufNr}`;
  for (const k of ALLE_KOS) st.knowledgeObjects.set(k.id, JSON.parse(JSON.stringify(k)));
  return st;
}

// Ein Lauf ueber den ECHTEN Produktionspfad. `rezept` setzt die exportierte
// Vertragskonstante VORUEBERGEHEND — das ist der einzige ehrliche Weg, den
// Zustand VOR der Anhebung im selben Prozess zu erzeugen: der Produktionspfad
// selbst (matching.js liest die Konstante zur Laufzeit) bleibt unveraendert,
// es wird nichts nachgebaut. Der Wert wird immer zurueckgesetzt.
async function lauf(store, profil, rezept) {
  const vorher = contract.LEGACY_RECIPE_VERSION;
  contract.LEGACY_RECIPE_VERSION = rezept;
  try {
    return await matching.runMatchingShadow(
      { profile: profil, ausloeser: "crawl" },
      store.matchingOverrides
    );
  } finally {
    contract.LEGACY_RECIPE_VERSION = vorher;
  }
}
const zeilen = (store, userId) =>
  store.api.listMatchingResults({ userId, limit: 50, includeAbgeloest: true });

(async () => {
  // ═══ A · Der Vertragswert selbst (kleinstmoegliche Anhebung) ═══
  abschnitt("A · Rezeptversion: angehoben, sauber benannt, minimal");

  check("A1 die produktive Rezeptversion ist legacy_relevance_v2",
    contract.LEGACY_RECIPE_VERSION === "legacy_relevance_v2", contract.LEGACY_RECIPE_VERSION);
  check("A2 der Name bleibt in der Legacy-Familie und ist vom semantischen Rezept unterscheidbar",
    /^legacy_relevance_v\d+$/.test(contract.LEGACY_RECIPE_VERSION)
      && contract.LEGACY_RECIPE_VERSION !== require("../lib/helmut/embedding-contract").RECIPE_VERSION);
  check("A3 NUR die Rezeptachse wurde angehoben — Engine und Vektor unveraendert (kleinstmoegliche Aenderung)",
    contract.LEGACY_ENGINE_VERSION === "legacy-shadow-1"
      && contract.legacyVectorVersion(256) === "feature-hash-256-v1",
    `${contract.LEGACY_ENGINE_VERSION} / ${contract.legacyVectorVersion(256)}`);
  check("A4 auch die Version des Auditdatenvertrags bleibt unveraendert (kein Schemabruch)",
    contract.AUDIT_SCHEMA_VERSION === "matching-audit-1", contract.AUDIT_SCHEMA_VERSION);

  // ═══ B · BEWEIS 1: Die neue Rezeptversion veraendert den Fingerabdruck ═══
  abschnitt("B · Beweis 1: der Eingabefingerabdruck aendert sich");

  const token = [{ token: "ausschuss:arbeit-und-soziales", weight: 3 }, { token: "thema:rente", weight: 2 }];
  check("B1 Eingabehash je Wissensobjekt: identische Token, v1 != v2",
    contract.computeKnowledgeObjectInputHash(token, V1)
      !== contract.computeKnowledgeObjectInputHash(token, V2));

  const kandidaten = [
    { ko_id: "ko-1", similarity: 0.42, ko_eingabe_hash: "h1" },
    { ko_id: "ko-2", similarity: 0.31, ko_eingabe_hash: "h2" }
  ];
  check("B2 Kandidatenhash: identische Kandidaten, v1 != v2",
    contract.computeCandidateSetHash(kandidaten, V1) !== contract.computeCandidateSetHash(kandidaten, V2));

  const basis = {
    tenantId: "rv2-mandat-a", mandateProfileId: "rv2-mandat-a", profileHash: "ph-1",
    engineVersion: contract.LEGACY_ENGINE_VERSION, vectorVersion: contract.legacyVectorVersion(256),
    thresholds: { matchCount: 20, schwelle: null, filter: {} }, ranking: kandidaten
  };
  const fpV1 = contract.computeInputFingerprint({ ...basis, recipeVersion: V1 });
  const fpV2 = contract.computeInputFingerprint({ ...basis, recipeVersion: V2 });
  check("B3 vollstaendige Laufbeschreibung: NUR die Rezeptversion unterscheidet sich -> anderer Fingerabdruck",
    fpV1.fingerprint !== fpV2.fingerprint, `${fpV1.fingerprint.slice(0, 16)} vs ${fpV2.fingerprint.slice(0, 16)}`);
  check("B3b die Rezeptversion steht zusaetzlich als eigenes Feld im kanonischen Objekt (dreifach abgesichert)",
    fpV1.kanon.rezept === V1 && fpV2.kanon.rezept === V2 && fpV1.kandidatenHash !== fpV2.kandidatenHash);
  check("B4 die Anhebung ist deterministisch: zweimal v2 -> identischer Fingerabdruck",
    contract.computeInputFingerprint({ ...basis, recipeVersion: V2 }).fingerprint === fpV2.fingerprint);
  check("B5 ausser der Rezeptversion aendert sich am kanonischen Objekt nichts",
    j({ ...fpV1.kanon, rezept: null, kandidaten_hash: null })
      === j({ ...fpV2.kanon, rezept: null, kandidaten_hash: null }));

  // ═══ C · BEWEIS 2: Bestehende Ergebnisse werden neu berechnet ═══
  abschnitt("C · Beweis 2: der naechste regulaere Lauf rechnet neu (echter Produktionspfad)");

  const store = neuerStore();
  // Altstand: so, wie Production heute dasteht — vor dem Fix gerechnete Zeilen.
  const altA = await lauf(store, PROFIL_A, V1);
  const zeilenAltA = zeilen(store, PROFIL_A.id).map((r) => ({ ...r }));
  check("C1 Altstand: Lauf vollstaendig, Zeilen tragen die alte Rezeptversion",
    altA && !altA.skipped && altA.audit && altA.audit.idempotent === false
      && zeilenAltA.length === 3 && zeilenAltA.every((r) => r.rezept_version === V1),
    j({ audit: altA && altA.audit, versionen: zeilenAltA.map((r) => r.rezept_version) }));

  // Gegenprobe: OHNE die Anhebung bliebe genau dieser Lauf idempotent — das ist
  // Befund B25-2. Ohne diesen Nachweis waere die Anhebung nicht begruendet.
  const ohneAnhebung = await lauf(store, PROFIL_A, V1);
  check("C2 GEGENPROBE (Befund B25-2): ohne Anhebung bleibt der Folgelauf idempotent — die falschen Zeilen blieben stehen",
    ohneAnhebung.audit.idempotent === true && ohneAnhebung.saved === 0
      && zeilen(store, PROFIL_A.id).every((r) => r.rezept_version === V1),
    j(ohneAnhebung.audit));

  const neuA = await lauf(store, PROFIL_A, V2);
  const zeilenNeuA = zeilen(store, PROFIL_A.id).map((r) => ({ ...r }));
  // Massgeblich ist der FINGERABDRUCK, nicht die Laufkennung: die Kennung traegt
  // im Geruest einen festen Zufallsanteil und Sekundenaufloesung, zwei Laeufe in
  // derselben Sekunde koennen dieselbe Kennung tragen. Der Fingerabdruck ist die
  // fachliche Identitaet der Generation.
  check("C3 MIT Anhebung: derselbe Eingang ist NICHT mehr idempotent -> neue Generation",
    neuA.audit.idempotent === false && neuA.audit.fingerprint !== ohneAnhebung.audit.fingerprint,
    j({ neu: neuA.audit.fingerprint, alt: ohneAnhebung.audit.fingerprint }));
  check("C4 alle bestehenden Zeilen sind neu berechnet und tragen die neue Rezeptversion",
    zeilenNeuA.length === 3 && zeilenNeuA.every((r) => r.rezept_version === V2)
      && neuA.veroeffentlicht === 3,
    j(zeilenNeuA.map((r) => r.rezept_version)));
  check("C5 der neue Fingerabdruck steht an jeder Zeile und unterscheidet sich vom alten",
    zeilenNeuA.every((r) => r.eingabe_fingerabdruck === zeilenNeuA[0].eingabe_fingerabdruck)
      && zeilenNeuA[0].eingabe_fingerabdruck !== zeilenAltA[0].eingabe_fingerabdruck);
  check("C6 auch der Eingabehash je Wissensobjekt ist neu (er traegt die Rezeptversion)",
    zeilenNeuA.every((neu) => {
      const alt = zeilenAltA.find((a) => a.knowledge_object_id === neu.knowledge_object_id);
      return alt && alt.ko_eingabe_hash && neu.ko_eingabe_hash && alt.ko_eingabe_hash !== neu.ko_eingabe_hash;
    }));
  check("C7 es entstehen KEINE zusaetzlichen Zeilen — je Vorgang genau eine aktuelle Zeile",
    new Set(zeilenNeuA.map((r) => r.knowledge_object_id)).size === 3
      && zeilenNeuA.filter((r) => r.aktuell === true).length === 3);

  // ═══ D · BEWEIS 4: danach wieder idempotent ═══
  abschnitt("D · Beweis 4: der identische Folgelauf ist wieder idempotent");

  const wieder = await lauf(store, PROFIL_A, V2);
  check("D1 identischer Eingang unter v2 -> idempotent, keine neue Generation",
    wieder.audit.idempotent === true && wieder.audit.runId === neuA.audit.runId,
    j(wieder.audit));
  check("D2 der idempotente Lauf schreibt KEINE Ergebniszeile und zaehlt nur die Wiederholung",
    wieder.saved === 0 && wieder.audit.wiederholungen === 1, j(wieder.audit));
  check("D3 die Anhebung wirkt also GENAU EINMAL je Mandant (kein dauerhaftes Neuschreiben)",
    zeilen(store, PROFIL_A.id).every((r) => r.rezept_version === V2)
      && zeilen(store, PROFIL_A.id).length === 3);
  const nochmal = await lauf(store, PROFIL_A, V2);
  check("D4 auch ein dritter identischer Lauf bleibt idempotent (stabil, kein Flattern)",
    nochmal.audit.idempotent === true && nochmal.saved === 0 && nochmal.audit.wiederholungen === 2,
    j(nochmal.audit));

  // ═══ E · BEWEIS 3: Ausschussbelege folgen der korrigierten Logik ═══
  abschnitt("E · Beweis 3: die Ausschussbelege folgen der korrigierten Zulaessigkeitslogik");

  const merkmale = (userId, koId) => {
    const r = zeilen(store, userId).find((x) => x.knowledge_object_id === koId);
    return (r && r.matched_features) || [];
  };
  const hatAusschuss = (userId, koId) => merkmale(userId, koId).some((f) => f.type === "ausschuss");

  check("E1 Bundesmandat x BUNDESvorgang mit demselben Ausschuss -> Ausschussbeleg vorhanden",
    hatAusschuss(PROFIL_A.id, KO_BUND_AUSSCHUSS.id), j(merkmale(PROFIL_A.id, KO_BUND_AUSSCHUSS.id)));
  check("E2 Bundesmandat x LANDESvorgang mit demselben Ausschuss-Stamm -> KEIN Ausschussbeleg (Befund 27A-2)",
    !hatAusschuss(PROFIL_A.id, KO_LAND_AUSSCHUSS.id), j(merkmale(PROFIL_A.id, KO_LAND_AUSSCHUSS.id)));
  check("E3 der fachliche Bezug bleibt erhalten: der Landesvorgang traegt weiterhin sein Thema",
    merkmale(PROFIL_A.id, KO_LAND_AUSSCHUSS.id).some((f) => f.type === "thema"),
    j(merkmale(PROFIL_A.id, KO_LAND_AUSSCHUSS.id)));
  check("E4 dieselbe Regel direkt an der echten Produktionsfunktion",
    matching.ausschussBelegZulaessig(
      matching.profileZustaendigkeit(PROFIL_A),
      matching.knowledgeObjectZustaendigkeit(KO_BUND_AUSSCHUSS)) === true
    && matching.ausschussBelegZulaessig(
      matching.profileZustaendigkeit(PROFIL_A),
      matching.knowledgeObjectZustaendigkeit(KO_LAND_AUSSCHUSS)) === false);
  check("E5 die Anhebung aendert die REGEL nicht — sie war unter v1 identisch (nur die Zeilen waren alt)",
    zeilenAltA.find((r) => r.knowledge_object_id === KO_LAND_AUSSCHUSS.id)
      .matched_features.every((f) => f.type !== "ausschuss"));
  check("E6 die persistierte Begruendung des Landesvorgangs behauptet keine Ausschussmitgliedschaft",
    !/ausschuss/i.test(String(
      (zeilen(store, PROFIL_A.id).find((r) => r.knowledge_object_id === KO_LAND_AUSSCHUSS.id) || {}).begruendung || "")),
    j((zeilen(store, PROFIL_A.id).find((r) => r.knowledge_object_id === KO_LAND_AUSSCHUSS.id) || {}).begruendung));

  // ═══ F · BEWEIS 5: keine Regression fuer andere Mandanten ═══
  abschnitt("F · Beweis 5: keine Regression fuer andere Mandanten");

  const storeB = neuerStore();
  const altB = await lauf(storeB, PROFIL_B, V1);
  const zeilenAltB = zeilen(storeB, PROFIL_B.id).map((r) => ({ ...r }));
  const neuB = await lauf(storeB, PROFIL_B, V2);
  const zeilenNeuB = zeilen(storeB, PROFIL_B.id).map((r) => ({ ...r }));

  check("F1 ein zweiter, voellig anderer Mandant wird ebenfalls genau einmal neu gerechnet",
    altB.audit.idempotent === false && neuB.audit.idempotent === false
      && zeilenNeuB.every((r) => r.rezept_version === V2) && zeilenNeuB.length === zeilenAltB.length,
    j({ alt: zeilenAltB.length, neu: zeilenNeuB.length }));

  // Der eigentliche Regressionsbeweis: Feld fuer Feld. Nur die Versions- und
  // Laufmetadaten duerfen sich unterscheiden — das FACHLICHE Ergebnis nicht.
  const NUR_DIESE_DUERFEN_SICH_AENDERN = new Set([
    "rezept_version", "ko_eingabe_hash", "eingabe_fingerabdruck", "run_id",
    "berechnet_am", "updated_at", "created_at"
  ]);
  const abweichungen = [];
  for (const alt of zeilenAltB) {
    const neu = zeilenNeuB.find((r) => r.knowledge_object_id === alt.knowledge_object_id);
    if (!neu) { abweichungen.push(`${alt.knowledge_object_id}: Zeile fehlt`); continue; }
    for (const feld of new Set([...Object.keys(alt), ...Object.keys(neu)])) {
      if (NUR_DIESE_DUERFEN_SICH_AENDERN.has(feld)) continue;
      if (j(alt[feld]) !== j(neu[feld])) abweichungen.push(`${alt.knowledge_object_id}.${feld}`);
    }
  }
  check("F2 Feld-fuer-Feld: ausser Versions-/Laufmetadaten ist JEDES Feld byte-identisch (Aehnlichkeit, Rang, Merkmale, Signale, Begruendung, Filter)",
    abweichungen.length === 0, j(abweichungen));
  check("F3 insbesondere Aehnlichkeit und Rang sind unveraendert — die Rangfolge kippt nicht",
    zeilenAltB.every((alt) => {
      const neu = zeilenNeuB.find((r) => r.knowledge_object_id === alt.knowledge_object_id);
      return neu && neu.similarity === alt.similarity && neu.rank === alt.rank;
    }));
  check("F4 Engine- und Vektorversion an den Zeilen unveraendert",
    zeilenNeuB.every((r) => r.engine_version === "legacy-shadow-1" && r.vektor_version === "feature-hash-256-v1"));
  check("F5 Mandantentrennung: jede Zeile traegt ihren eigenen Mandanten, keine fremden Zeilen",
    zeilenNeuB.every((r) => r.user_id === PROFIL_B.id)
      && zeilen(storeB, PROFIL_A.id).length === 0
      && storeB.fremdzugriffe.length === 0,
    j(storeB.fremdzugriffe));
  check("F6 der zweite Mandant ist danach ebenfalls wieder idempotent",
    (await lauf(storeB, PROFIL_B, V2)).audit.idempotent === true);

  // ═══ H · Rueckweg (git revert der Anhebung) ═══
  abschnitt("H · Rueckweg: was ein revert der Anhebung bewirkt — und was nicht");

  const zurueck = await lauf(store, PROFIL_A, V1);
  check("H1 nach einem revert findet der naechste Lauf den ALTEN v1-Lauf wieder -> idempotent, keine dritte Generation",
    zurueck.audit.idempotent === true && zurueck.saved === 0, j(zurueck.audit));
  check("H2 der revert macht die Korrektur NICHT rueckgaengig: die Zeilen behalten ihre korrigierten Werte",
    zeilen(store, PROFIL_A.id).every((r) => r.rezept_version === V2)
      && !zeilen(store, PROFIL_A.id)
        .find((r) => r.knowledge_object_id === KO_LAND_AUSSCHUSS.id)
        .matched_features.some((f) => f.type === "ausschuss"),
    j(zeilen(store, PROFIL_A.id).map((r) => r.rezept_version)));
  check("H3 der Rueckweg ist damit gefahrlos: er stoppt nur weitere Neuberechnungen, er beschaedigt nichts",
    zeilen(store, PROFIL_A.id).length === 3
      && zeilen(store, PROFIL_A.id).filter((r) => r.aktuell === true).length === 3);

  // ═══ G · Kosten- und Sicherheitsgrenzen ═══
  abschnitt("G · Kosten und Grenzen");

  check("G1 im gesamten Lauf wurde KEIN KI-Modul geladen (0 Aufrufe, 0,00 USD)",
    !Object.keys(require.cache).some((k) => /lib[\\/]helmut[\\/]ai\.js$/.test(k)),
    j(Object.keys(require.cache).filter((k) => /ai\.js$/.test(k))));
  check("G2 die Neuberechnung ist reine Rechenarbeit — kein KI-Pfad im Matching",
    !/require\(["']\.\/ai["']\)/.test(require("fs").readFileSync(
      require("path").join(__dirname, "..", "lib", "helmut", "matching.js"), "utf8")));
  check("G3 die Vertragskonstante ist nach allen Laeufen unveraendert wiederhergestellt",
    contract.LEGACY_RECIPE_VERSION === "legacy_relevance_v2", contract.LEGACY_RECIPE_VERSION);

  console.log(`\n${stand.passed} bestanden, ${stand.failed} fehlgeschlagen`);
  process.exit(stand.failed ? 1 : 0);
})().catch((error) => {
  console.error("SUITE-FEHLER:", (error && error.stack) || error);
  process.exit(2);
});
