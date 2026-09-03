"use strict";

// Helmut — TESTKOHORTE für 500 Mandate (500-Mandate-Reife, 2026-09-01).
// =====================================================================================
// Deterministischer Generator für 495 SYNTHETISCHE Mandats-Spezifikationen im
// Format des Anlage-Stapels (`provisioning.validateSpec` / `provisionBatch`).
// Zielbild: 5 bestehende reale Mandate + 495 synthetische Testprofile = 500.
// Die drei Gruppen bleiben 20 / 75 / 400 (Aktivierungsstufen A/B/C — die
// Gruppen sind PLANUNGSEINHEITEN; keine Gruppe wird von diesem Modul angelegt,
// provisioniert oder aktiviert).
//
// VERBINDLICHE EIGENSCHAFTEN (testgesichert, scripts/test-kohorte-500-test.js):
//  1. STRIKTE TRENNUNG von realen Mandaten: eigene Kennungsfamilie
//     `test-kohorte-<gruppe>-<nnn>` — kollidiert mit keiner bestehenden Familie
//     (Klarnamen-Slugs der 5 realen Mandate und 20 Importprofile, `test-mdb-*`
//     Offline-Testmandate, `synth-mandat-*` Lastfixture, `stapel-*` Testsuite).
//  2. NEUTRALE Kennungen und Namen: `Testmandat A-001` …, Testpartei/-thema —
//     KEINE echten Namen, Parteien oder personenbezogenen Daten.
//     AUSNAHME SEIT 03.09. (§34.7 Variante A, siehe unten): die AUSSCHÜSSE der
//     BUNDESTAGSprofile sind echte, amtliche Bezeichnungen der 21. Wahlperiode.
//     Ein Ausschuss ist keine personenbezogene Angabe, sondern ein
//     Zuständigkeitsbereich des Parlaments — und die Bundestagsreife-Sperre
//     (`profile-readiness.pruefeNeuaktivierung`) verlangt genau sie.
//  3. PASSWÖRTER NUR ZUR LAUFZEIT: die deterministische Spezifikation trägt KEIN
//     Passwort; `mitLaufzeitPasswort` erzeugt eines erst im Prozessspeicher
//     (crypto.randomBytes), es wird nie persistiert oder ausgegeben.
//  4. STANDARDMÄSSIG INAKTIV: kein `aktiv`-Wunschfeld (der Anlage-Stapel legt
//     ausschließlich inaktiv an und lehnt Aktivierungswünsche ab — dieser
//     Generator erzeugt erst gar keinen).
//  5. KEINE PROVISIONIERUNG durch dieses Modul: es baut reine Datenobjekte.
//  6. DETERMINISTISCH: alle Merkmale entstehen aus dem Index über feste
//     Teilerreste (Vorbild scripts/fixtures/synthetische-mandate-1000.js) —
//     zwei Aufrufe liefern byte-identische Spezifikationen.
//  7. REIFEFÄHIG JE POLITISCHER EBENE (ergänzt 03.09.): jede Spezifikation
//     besteht die für IHRE Ebene zuständige Prüfung — Bundestagsprofile die
//     Bundestagsreife (`pruefeNeuaktivierung`), Landtagsprofile `validateProfile`.
//
// ─── DIE AUSSCHÜSSE: WARUM BUNDESTAG ECHT UND LANDTAG SYNTHETISCH IST ────────
//
// BEFUND 03.09. (Sicherheitsrahmen §34.7, am echten Provisionierungspfad
// gemessen): `provisioning.provisionTenant` ruft in Schritt 2b die
// Bundestagsreife-Sperre auf. Sie verlangt, dass jeder angegebene Ausschuss
// eines BUNDESTAGSprofils gegen die extern verankerte Sollmenge der
// 21. Wahlperiode auflösbar ist. Die Kohorte trug „Testausschuss N" — damit
// wies der echte Pfad 18 von 20 Profilen der Stufe A ab (434 von 495 der
// Gesamtkohorte — der Sicherheitsrahmen nannte zunaechst 433, nachgemessen sind
// es 434), jeweils VOR jedem Schreibvorgang mit
// `bundestagsprofil-nicht-bereit`.
//
// GEWÄHLTE LÖSUNG (Variante A): die Kohorte richtet sich nach der Regel, nicht
// die Regel nach der Kohorte. Die Sperre wird weder gelockert noch für die
// synthetische Kennungsfamilie ausgesetzt — sie schützt die Radar- und
// Paketzuordnung realer Mandate und muss für synthetische Profile GENAUSO
// gelten, sonst prüfte der Testlauf einen Pfad, den kein reales Mandat geht.
//
// BUNDESTAGSPROFILE bekommen deshalb echte Ausschussbezeichnungen — aus der
// kanonischen Quelle der REIFEPRÜFUNG,
// `quellenarchitektur/seeds/bundestag-ausschuesse.js` (Einsetzungsbeschluss
// 21/150). KEINE zweite handgeschriebene Namensliste IN DIESEM MODUL:
// wird dort umbenannt, wandert die Änderung automatisch mit, und der
// Regressionstest `test-kohorte-500-test.js` (§4.5b und §11.5–§11.8) schlägt
// fehl, sobald ein Bundestagsprofil einen unbekannten oder veralteten Ausschuss
// trägt.
//
// LANDTAGSPROFILE behalten die SYNTHETISCHEN Bezeichnungen. Ein Landtag hat
// eigene Ausschüsse; ihm eine Bundestagsbezeichnung zu geben, wäre eine falsche
// fachliche Aussage über seine politische Ebene — und die Bundestagsreife ist
// für sie ausdrücklich nicht zuständig (`zutreffend: false`, keine Vermischung).
//
// WAS SICH DADURCH NICHT ÄNDERT: Kennungen, `.invalid`-Adressen, Testmandats-
// namen, Testparteien, Testthemen, Gruppengrößen 20/75/400 und der Grundsatz,
// dass dieses Modul nichts anlegt und nichts aktiviert.
//
// GRENZE DIESER AUSSAGE, ausdruecklich (Reviewbefund 03.09.): „eine
// Ausschusswahrheit" gilt fuer die KOHORTE und fuer die REIFEPRUEFUNG — nicht
// fuer das ganze System. `quellenarchitektur/seeds/entities.js` fuehrt eine
// zweite, kuratierte Ausschussliste (23 Eintraege), die der Radar-Ausschussbeleg
// benutzt; sie ist von der Sollmenge bereits abgewichen. Das ist ein EIGENER,
// aelterer Befund, der mit dieser Kohorte nichts zu tun hat und hier bewusst
// NICHT mitrepariert wird (er wuerde das Radarverhalten realer Mandate
// aendern). Beleg und Messwerte: Sicherheitsrahmen §34.13.7.

const GRUPPEN = Object.freeze([
  Object.freeze({ kennung: "a", groesse: 20, zweck: "Aktivierungsstufe A (erste 20 — Übergang 5→25)" }),
  Object.freeze({ kennung: "b", groesse: 75, zweck: "Aktivierungsstufe B (75 — Übergang 25→100)" }),
  Object.freeze({ kennung: "c", groesse: 400, zweck: "Aktivierungsstufe C (400 — Übergang 100→500)" })
]);
const KOHORTE_GESAMT = 495;
const REALE_MANDATE = 5;
const PRAEFIX = "test-kohorte";

// Neutrale, klar synthetische Vorräte (deterministisch rotiert; bewusst KEINE
// echten Parteien, Ausschüsse, Länder-Personendaten oder Themen von Mandaten).
const TESTPARTEIEN = Object.freeze(["Testpartei A", "Testpartei B", "Testpartei C", "Testpartei D", "Testpartei E", "Testpartei F"]);
const BUNDESLAENDER = Object.freeze([
  "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg",
  "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen",
  "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen"
]);
// Synthetische Ausschüsse — ausschließlich für LANDTAGSprofile (siehe Kopf).
const TESTAUSSCHUESSE = Object.freeze(Array.from({ length: 12 }, (_, i) => `Testausschuss ${i + 1}`));

// Die amtlichen Ausschussbezeichnungen der 21. Wahlperiode für BUNDESTAGSprofile.
// EINE Quelle: die extern verankerte Sollmenge. Hier steht bewusst KEINE Kopie
// der Namen — eine zweite Liste wäre eine zweite Ausschusswahrheit und würde bei
// einer Umbenennung still auseinanderlaufen.
const { AUSSCHUSS_NAMEN: BUNDESTAGSAUSSCHUESSE } = require("./quellenarchitektur/seeds/bundestag-ausschuesse");
const TESTTHEMEN = Object.freeze(Array.from({ length: 15 }, (_, i) => `Testthema ${i + 1}`));

function gruppeVonIndex(index) {
  let rest = index;
  for (const g of GRUPPEN) {
    if (rest < g.groesse) return { gruppe: g.kennung, nummer: rest + 1 };
    rest -= g.groesse;
  }
  return null;
}

function kohortenId(index) {
  const g = gruppeVonIndex(index);
  if (!g) return null;
  return `${PRAEFIX}-${g.gruppe}-${String(g.nummer).padStart(3, "0")}`;
}

// EINE deterministische Spezifikation (ohne Passwort — Eigenschaft 3).
function baueSpezifikation(index) {
  const g = gruppeVonIndex(index);
  if (!g) return null;
  const id = kohortenId(index);
  const name = `Testmandat ${g.gruppe.toUpperCase()}-${String(g.nummer).padStart(3, "0")}`;
  // Jedes 8. Mandat ist Landtag (Vorbild 1000er-Fixture), der Rest Bundestag.
  const istLandtag = index % 8 === 7;
  const bundesland = BUNDESLAENDER[index % BUNDESLAENDER.length];
  const spec = {
    id,
    // AUSDRÜCKLICHE ZUSTIMMUNG ZUR SYNTHETISCHEN KENNUNGSFAMILIE (02.09.):
    // `provisioning.validateSpec` weist seit diesem Sprint jede Kennung aus den
    // vier reservierten Familien ab — ein REALES Mandat darf sie nie tragen,
    // weil sonst Kommunikationsriegel, Verdrängungsschutz, Erlaubnisliste und
    // Rückbau es alle für synthetisch hielten. Der Kohortenweg sagt hier
    // ausdrücklich, dass er genau das will.
    synthetischErlaubt: true,
    email: `${id}@test-kohorte.invalid`, // RFC-reservierte TLD: nie zustellbar
    // ─── BEFUND 02.09. (adversariale Analyse, bestätigt) ────────────────────
    // Die Spezifikation setzte weder `aiBudgetDailyCents` noch
    // `aiBudgetMonthlyCents`. `evaluateTenantBudget` liefert dann
    // `applied:false, allowed:true` (llm-budget.js:49-52) — der EINZIGE heute
    // produktiv wirksame Per-Mandant-Deckel war für alle 495 Kohortenprofile
    // ein No-op, während er für reale Mandate mit gesetztem Profilbudget greift.
    //
    // EHRLICHE EINORDNUNG: das ist ein Rückfallnetz gegen EIN durchdrehendes
    // synthetisches Profil, NICHT die bindende Grenze. Bindend bleiben der
    // Tagesdeckel und die Kostenabbruchgrenze; 495 × 10 ct läge über beiden.
    // Gemessen kostet ein Aufruf ~0,27 ct, der erwartete Tagesanteil eines
    // synthetischen Profils liegt bei rund 3–4 Aufrufen (~1 ct). 10 ct/Tag
    // lassen also gut das Zehnfache zu und kappen erst echtes Durchdrehen.
    aiBudgetDailyCents: 10,
    aiBudgetMonthlyCents: 100,
    name,
    party: TESTPARTEIEN[index % TESTPARTEIEN.length],
    parliamentType: istLandtag ? "Landtag" : "Bundestag",
    // AUSSCHÜSSE JE EBENE (siehe Kopf): Bundestag echt (WP-21-Sollmenge),
    // Landtag synthetisch. Der Versatz 5 ist zu beiden Listenlängen (24 bzw. 12)
    // teilerfremd — die zwei Ausschüsse eines Profils sind damit immer
    // verschieden, ohne Sonderfall.
    committees: istLandtag
      ? [TESTAUSSCHUESSE[index % TESTAUSSCHUESSE.length], TESTAUSSCHUESSE[(index + 5) % TESTAUSSCHUESSE.length]]
      : [BUNDESTAGSAUSSCHUESSE[index % BUNDESTAGSAUSSCHUESSE.length], BUNDESTAGSAUSSCHUESSE[(index + 5) % BUNDESTAGSAUSSCHUESSE.length]],
    focusTopics: [TESTTHEMEN[index % TESTTHEMEN.length], TESTTHEMEN[(index + 7) % TESTTHEMEN.length]]
  };
  if (istLandtag) {
    spec.state = bundesland;
    spec.region = `Testregion ${((index % 40) + 1)}`;
  } else {
    spec.constituency = `Testwahlkreis ${String(index + 1).padStart(3, "0")}`;
  }
  return spec;
}

// Die vollständige Kohorte: 495 deterministische Spezifikationen (ohne Passwort).
function baueKohorte() {
  return Array.from({ length: KOHORTE_GESAMT }, (_, i) => baueSpezifikation(i));
}

// PASSWORT NUR ZUR LAUFZEIT: erzeugt eine Kopie der Spezifikation mit einem
// frisch gewürfelten Einmalpasswort (>= 8 Zeichen, validateSpec-konform).
// Injezierbarer Zufall NUR für Tests; Default ist crypto.randomBytes. Das
// Passwort existiert ausschließlich im Prozessspeicher des Aufrufers.
function mitLaufzeitPasswort(spec, { zufall } = {}) {
  const quelle = typeof zufall === "function"
    ? zufall
    : () => require("crypto").randomBytes(24).toString("base64url");
  return { ...spec, password: String(quelle()) };
}

// Übersicht der Gruppen (Planungssicht; ändert nichts).
function kohortenUebersicht() {
  return Object.freeze({
    realeMandate: REALE_MANDATE,
    synthetisch: KOHORTE_GESAMT,
    zielGesamt: REALE_MANDATE + KOHORTE_GESAMT,
    gruppen: GRUPPEN.map((g) => ({ ...g }))
  });
}

module.exports = {
  GRUPPEN,
  KOHORTE_GESAMT,
  REALE_MANDATE,
  PRAEFIX,
  // Für Tests und Auswertungen: die beiden Ausschussvorräte, ohne dass irgendwo
  // eine zweite Namensliste entsteht (BUNDESTAGSAUSSCHUESSE ist die Sollmenge).
  TESTAUSSCHUESSE,
  BUNDESTAGSAUSSCHUESSE,
  gruppeVonIndex,
  kohortenId,
  baueSpezifikation,
  baueKohorte,
  mitLaufzeitPasswort,
  kohortenUebersicht
};
