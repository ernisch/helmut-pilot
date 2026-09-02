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
//  2. NEUTRALE Kennungen und Namen: `Testmandat A-001` …, Testpartei/-ausschuss/
//     -thema — KEINE echten Namen, Parteien oder personenbezogenen Daten.
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
const TESTAUSSCHUESSE = Object.freeze(Array.from({ length: 12 }, (_, i) => `Testausschuss ${i + 1}`));
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
    name,
    party: TESTPARTEIEN[index % TESTPARTEIEN.length],
    parliamentType: istLandtag ? "Landtag" : "Bundestag",
    committees: [TESTAUSSCHUESSE[index % TESTAUSSCHUESSE.length], TESTAUSSCHUESSE[(index + 5) % TESTAUSSCHUESSE.length]],
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
  gruppeVonIndex,
  kohortenId,
  baueSpezifikation,
  baueKohorte,
  mitLaufzeitPasswort,
  kohortenUebersicht
};
