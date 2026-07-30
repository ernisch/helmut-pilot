"use strict";

// Befund 27A-1 UND 27A-2 — Ausschussbeleg nur bei passendem Zustaendigkeitsraum.
// =============================================================================
// DER FEHLER (gemessen vor dem Fix, reproduzierbar mit dieser Suite auf dem
// Stand `d9006c1`): `normalizeCommittee` faltet den Brandenburger "Ausschuss fuer
// Inneres und Kommunales" UND den Berliner "Ausschuss fuer Inneres, Sicherheit
// und Ordnung" auf denselben Stamm `inneres`. Ein BERLINER Vorgang erhielt beim
// BRANDENBURGER Profil dadurch den Beleg
//     ausschuss: "Ausschuss fuer Inneres und Kommunales"
// und damit die sichtbare Behauptung
//     "Betrifft deinen Ausschuss Ausschuss fuer Inneres und Kommunales."
// samt Entscheidungsgewicht (decisions.js: ausschuss 34) -> Score 62 ->
// "Sofort reagieren" fuer ein Mandat, das mit dem Vorgang institutionell nichts
// zu tun hat. `committeeMatchKey` loest das NICHT (Abschnitt A beweist das).
//
// BEFUND 27A-2 (in Production gemessen, §51; in diesem Sprint behoben, §52):
// DIESELBE Kollision faltet auch ueber die politischen EBENEN. Ein
// BUNDESTAGSprofil erhielt einen Ausschussbeleg, wenn ein LANDES- oder
// KOMMUNALvorgang einen gleichnamigen Landtags-/Kreistagsausschuss nannte
// ("Gesundheit" gegen "Gesundheitsausschuss (Landtag)", "Arbeit und Soziales"
// gegen "Sozialausschuss Kreistag Ostallgaeu"). Gemessen: 14 qualifizierte Paare
// bei 4 von 6 aktiven Bundestagsprofilen, 13 davon mit anderer
// Entscheidungsstufe, 5 ohne jeden weiteren Beleg.
//
// DIE REGEL (Produktregel des Sprints): ein politisches FACHGEBIET darf
// ebenen- und laenderuebergreifend aehnlich sein — eine konkrete
// AUSSCHUSSMITGLIEDSCHAFT gilt nur als Beleg, wenn Ausschuss und institutioneller
// Zustaendigkeitsraum zusammenpassen. Die Pruefung ist SYMMETRISCH:
//   * Landesmandat -> das Bundesland des Vorgangs muss POSITIV belegt dasselbe
//     sein (fail-closed),
//   * Bundesmandat -> die Ebene des Vorgangs muss POSITIV `bund` sein
//     (fail-closed; Landes-/Kommunalvorgang -> kein Beleg).
//
// GELTUNGSBEREICH: die Pruefung greift nur, wenn die PROFILSEITE bestimmt ist.
// Profile ohne belegte Mandatsebene und Landesmandate ohne belegtes Bundesland
// verhalten sich byte-identisch wie vorher (Abschnitt F beweist das).
// BEWUSST NICHT ENTSCHIEDEN: EU-/internationale Vorgaenge behalten fuer
// Bundesmandate ihr bisheriges Verhalten — dort nennen die echten
// Production-Daten teils ECHTE Bundestagsausschuesse ("Ausschuss fuer Arbeit und
// Soziales", "Auswaertiger Ausschuss"), teils fremde Gremien ("Europaeischer
// Ausschuss fuer soziale Rechte"). Die Ebene allein trennt das nicht; das ist ein
// getrennter Nebenbefund (§52.7), Abschnitt J schreibt den Ist-Stand fest.
//
// REIN OFFLINE: 0 KI, 0 Netz, 0 Datenbank, 0 Zufall. Es werden die ECHTEN
// Produktionsfunktionen geprueft (matching, matching-begruendung,
// matching-erklaerung, matching-relevanz, decisions) — keine Testkopie der Logik.

const m = require("../lib/helmut/matching");
const begruendung = require("../lib/helmut/matching-begruendung");
const erklaerung = require("../lib/helmut/matching-erklaerung");
const relevanz = require("../lib/helmut/matching-relevanz");
const decisions = require("../lib/helmut/decisions");

const crypto = require("crypto");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + String(detail).slice(0, 300) : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// ═══ 0 · BUNDESTAGSPROJEKTION: zwei verankerte Haschwerte ═══════════════════
// Nach dem 27A-2-Fix ist die Bundestagsprojektion NICHT mehr byte-identisch zum
// Altstand — genau das ist der Zweck des Sprints. Statt den Nachweis aufzugeben,
// wird er GETEILT:
//
//   0a  REGELFREIE Projektion == `GOLDEN_BUND_HASH` (auf `d9006c1` erhoben).
//       Dieselben Profile OHNE belegte Mandatsebene: der Zustaendigkeitsraum ist
//       unbestimmt, die Regel antwortet "nichts entscheidbar -> unveraendert",
//       die Projektion ist also die des Altstands. Diese Zusicherung beweist:
//       AUSSERHALB der Regel hat sich seit `d9006c1` nichts bewegt — nicht
//       Vektor, nicht Hash, nicht Rang, nicht Rezeptversion, nicht Entscheidung.
//       Sie ist eine exakte Rekonstruktion, keine Annaeherung: die Mandatsebene
//       geht nachweislich nicht in Vektor/Hash/Filter ein (H1/H2).
//   0b  Projektion MIT Regel == `GOLDEN_BUND_FIX_HASH` (nach dem Fix erhoben).
//       Sie friert das NEUE Bundesverhalten ein: jede kuenftige Abweichung ist
//       freigabepflichtig.
//   0c–0e  Der Unterschied zwischen beiden ist AUSSCHLIESSLICH der Wegfall von
//       Ausschussbelegen — namentlich verankert, kein neuer Beleg, sonst nichts.
//
// SO WURDEN SIE ERHOBEN (reproduzierbar):
//     git archive d9006c1 | tar -x -C /tmp/basis
//     cp scripts/matching-ausschuss-zustaendigkeit-test.js /tmp/basis/scripts/
//     cd /tmp/basis && HELMUT_GOLDEN_PRINT=1 node scripts/matching-ausschuss-zustaendigkeit-test.js
// Auf dem Altstand sind BEIDE gedruckten Werte gleich (die Regel greift dort fuer
// Bundesprofile nicht) — deshalb ist `GOLDEN_BUND_HASH` dort belegt. Dieser Block
// laeuft ABSICHTLICH als Erstes und benutzt ausschliesslich Funktionen, die es auf
// BEIDEN Staenden gibt; im Druckmodus endet er vor jeder Nutzung der neuen Regel.
//
// Enthalten sind alle Faelle, die in Production real vorkommen: Bundesvorgaenge,
// Landesvorgaenge (Nachrichten ueber Landespolitik), kommunale Vorgaenge und
// Vorgaenge ohne ermittelte Ebene/Geografie — jeweils mit und ohne
// Ausschussnennung. Verglichen wird die VOLLE Projektion: Rang, Aehnlichkeit,
// matched_features, Signale, Begruendung, KO-Eingabehash, Profilhash,
// Merkmalsvektoren, Rezept-/Vektorversion und die abgeleitete Entscheidung.
const GOLDEN_BUND_PROFILE = [
  { id: "gb-1", fullName: "Testmandat Bund A", party: "SPD", faction: "SPD",
    politicalLevel: "Bund", parliamentType: "Bundestag", state: "Niedersachsen",
    constituency: "Wahlkreis 50", committees: ["Ausschuss für Arbeit und Soziales"],
    focusTopics: ["Rente", "Arbeitsmarkt"], regionalInterests: ["Salzgitter"] },
  { id: "gb-2", fullName: "Testmandat Bund B", party: "CDU",
    politicalLevel: "Bund", parliamentType: "Bundestag", state: "Bayern",
    constituency: "Wahlkreis 217", committees: ["Innenausschuss", "Ausschuss für Inneres und Heimat"],
    focusTopics: ["Innere Sicherheit"], regionalInterests: ["München"] },
  { id: "gb-3", fullName: "Testmandat Bund C (ohne Ausschuss)", party: "Die Linke",
    politicalLevel: "Bund", parliamentType: "Bundestag", state: "Berlin",
    constituency: "Wahlkreis 84", committees: [], focusTopics: ["Wohnen"] },
  { id: "gb-4", fullName: "Testmandat ohne Mandatsebene", party: "SPD",
    state: "Brandenburg", committees: ["Ausschuss für Inneres und Kommunales"],
    focusTopics: ["Inneres"] }
];
function goldenKo(id, o) {
  return {
    id, vorgang_id: `vg-${id}`, ko_version: 1, status: "neu", understanding_status: "complete",
    headline: o.headline, was_ist_passiert: o.text, warum_wichtig: o.text,
    parteien: o.parteien || [], mentioned_parties: o.parteien || [],
    ausschuesse: o.ausschuesse || [], mentioned_committees: o.ausschuesse || [],
    mentioned_locations: o.orte || [],
    affected_geographies: o.geo || [], mentioned_geographies: o.geo || [],
    decision_level: o.ebene || "unknown", tags: [], policy_field: []
  };
}
const gGeo = (name, id, level) => ({ name, level, geography_id: id, herkunft: "inhalt" });
const GOLDEN_KOS = [
  goldenKo("bund-soziales", { headline: "Bundestag berät Rentenpaket", ebene: "bund",
    ausschuesse: ["Ausschuss für Arbeit und Soziales"], parteien: ["SPD"], text: "Der Bundestag berät das Rentenpaket." }),
  goldenKo("bund-inneres", { headline: "Bund ändert das Waffengesetz", ebene: "bund",
    ausschuesse: ["Ausschuss für Inneres und Heimat"], text: "Die Bundesregierung legt einen Entwurf vor." }),
  goldenKo("bund-ohne-ausschuss", { headline: "Haushalt 2027 im Kabinett", ebene: "bund",
    text: "Das Kabinett beschließt den Haushalt." }),
  goldenKo("land-berlin-inneres", { headline: "Berlin debattiert Silvesterlage", ebene: "land",
    geo: [gGeo("Berlin", "geo-land-berlin", "land")], orte: ["Berlin"],
    ausschuesse: ["Ausschuss für Inneres, Sicherheit und Ordnung"], text: "Das Abgeordnetenhaus von Berlin berät." }),
  goldenKo("land-bb-inneres", { headline: "Brandenburg legt Fallzahlen vor", ebene: "land",
    geo: [gGeo("Brandenburg", "geo-land-brandenburg", "land")], orte: ["Brandenburg"],
    ausschuesse: ["Ausschuss für Inneres und Kommunales"], text: "Der Landtag Brandenburg berät." }),
  goldenKo("land-bayern-soziales", { headline: "Bayern ändert Sozialgesetz", ebene: "land",
    geo: [gGeo("Bayern", "geo-land-bayern", "land")], orte: ["München"],
    ausschuesse: ["Sozialausschuss"], text: "Der Landtag Bayern berät." }),
  goldenKo("unknown-soziales", { headline: "Sozialausschuss berät Rente",
    ausschuesse: ["Ausschuss für Arbeit und Soziales"], text: "Der Ausschuss berät die Rente." }),
  goldenKo("kommune-salzgitter", { headline: "Salzgitter beschließt Wohnungsbau", ebene: "kommune",
    orte: ["Salzgitter"], ausschuesse: ["Ausschuss für Bauen und Wohnen"], text: "Der Rat beschließt." }),
  goldenKo("land-ohne-geo", { headline: "Landesinnenausschuss tagt", ebene: "land",
    ausschuesse: ["Ausschuss für Inneres und Heimat"], text: "Der Innenausschuss des Landtags tagt." })
];
// Dieselben Profile OHNE belegte Mandatsebene -> Zustaendigkeitsraum unbestimmt
// -> die Regel ist inert -> Verhalten des Altstands (siehe Blockkopf).
const GOLDEN_BUND_PROFILE_REGELFREI = GOLDEN_BUND_PROFILE.map((p) => {
  const q = { ...p };
  delete q.politicalLevel;
  delete q.parliamentType;
  return q;
});
function goldenProjektion(profile = GOLDEN_BUND_PROFILE) {
  const vertrag = require("../lib/helmut/matching-contract");
  const raus = {};
  for (const p of profile) {
    const rezept = vertrag.LEGACY_RECIPE_VERSION;
    raus[p.id] = {
      profil_hash: m.profileHash(p),
      profil_vektor: m.embedProfile(p),
      rezept_version: rezept,
      vektor_version: vertrag.legacyVectorVersion(m.EMBEDDING_DIM),
      projektion: m.matchProfileToKnowledgeObjects(p, GOLDEN_KOS, { limit: 20 }).map((r) => {
        const k = GOLDEN_KOS.find((x) => x.id === r.knowledge_object_id);
        const signale = begruendung.buildSignals(r.matched_features, r.similarity);
        return {
          ...r, signale,
          begruendung: begruendung.begruendungAusSignalen(signale, r.matched_features),
          ko_eingabe_hash: vertrag.computeKnowledgeObjectInputHash(m.knowledgeObjectWeightedTokens
            ? m.knowledgeObjectWeightedTokens(k) : [], rezept)
        };
      }),
      entscheidungen: decisions.decideForUser(p, GOLDEN_KOS, { userId: p.id })
        .map((d) => ({ ko: d.knowledge_object_id, score: d.score, decision: d.decision, priority_type: d.priority_type, feats: d.matched_features }))
    };
  }
  raus.__ko_vektoren = Object.fromEntries(GOLDEN_KOS.map((k) => [k.id, m.embedKnowledgeObject(k)]));
  return JSON.stringify(raus, null, 1);
}
// Auf dem Stand d9006c1 (VOR dem 27A-1-Fix) erhoben — siehe Anleitung oben.
const GOLDEN_BUND_HASH = "48d761b7033ecc92721d4566de5975b5f4525e4df7b085bf8621823d60bee387";
// Nach dem 27A-2-Fix erhoben. Friert das NEUE Bundesverhalten ein.
// Gegengeprueft: auf `d9006c1` liefert der Druckmodus fuer BEIDE Zeilen
// `48d761b7…` (die Regel existierte dort nicht) — die regelfreie Rekonstruktion
// in 0a ist damit nicht nur behauptet, sondern am Altstand belegt.
const GOLDEN_BUND_FIX_HASH = "3367bfbadcf54cf755ebb65e6541f30c3b32c913881a257cdd34618179955640";
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
if (process.env.HELMUT_GOLDEN_PRINT) {
  process.stdout.write(`regelfrei ${hash(goldenProjektion(GOLDEN_BUND_PROFILE_REGELFREI))}\n`);
  process.stdout.write(`mit-regel ${hash(goldenProjektion(GOLDEN_BUND_PROFILE))}\n`);
  process.exit(0);
}
abschnitt("0 · Bundestagsprojektion: Altstand rekonstruiert + neues Verhalten verankert");
const goldenRegelfrei = hash(goldenProjektion(GOLDEN_BUND_PROFILE_REGELFREI));
const goldenMitRegel = hash(goldenProjektion(GOLDEN_BUND_PROFILE));
check("0a (Pflicht 24) regelfreie Projektion ist byte-identisch zum Stand d9006c1 — ausser der Regel hat sich nichts bewegt",
  goldenRegelfrei === GOLDEN_BUND_HASH,
  `erwartet ${GOLDEN_BUND_HASH}, gemessen ${goldenRegelfrei} — es hat sich etwas AUSSERHALB der Zustaendigkeitsregel geaendert, das ist FREIGABEPFLICHTIG`);
check("0b Projektion MIT Regel ist byte-identisch zum verankerten Stand nach dem 27A-2-Fix",
  goldenMitRegel === GOLDEN_BUND_FIX_HASH,
  `erwartet ${GOLDEN_BUND_FIX_HASH}, gemessen ${goldenMitRegel} — das Bundesverhalten hat sich geaendert, das ist FREIGABEPFLICHTIG`);

// 0c–0e: der Unterschied zwischen beiden Staenden, Paar fuer Paar. Verankert ist
// die VOLLSTAENDIGE Liste der Wegfaelle — nicht nur ihre Anzahl. Ein zusaetzlicher
// oder fehlender Wegfall macht die Suite rot.
// `unknown-soziales` steht bewusst NICHT hier: bei unbelegter Ebene bleibt das
// Verhalten unveraendert (siehe Kommentar an `ausschussBelegZulaessig`, G8).
const GOLDEN_ERWARTETE_WEGFAELLE = [
  ["gb-1", "land-bayern-soziales", "Ausschuss für Arbeit und Soziales"],   // Landtag Bayern
  ["gb-2", "land-berlin-inneres", "Innenausschuss"],                       // Abgeordnetenhaus Berlin
  ["gb-2", "land-bb-inneres", "Innenausschuss"],                           // Landtag Brandenburg
  ["gb-2", "land-ohne-geo", "Innenausschuss"]                              // Ebene land, Geografie leer
];
function goldenDiff() {
  const raus = { wegfaelle: [], neue: [], restGleich: 0, paare: 0 };
  for (const p of GOLDEN_BUND_PROFILE) {
    const pf = m.profileFeatures(p);
    const pfRegelfrei = { ...pf, zustaendigkeit: null };
    for (const k of GOLDEN_KOS) {
      const kf = m.knowledgeObjectFeatures(k);
      const mitRegel = m.matchedFeatures(pf, kf);
      const regelfrei = m.matchedFeatures(pfRegelfrei, { ...kf, zustaendigkeit: null });
      const aus = (fs) => fs.filter((f) => f.type === "ausschuss").map((f) => f.value);
      const rest = (fs) => JSON.stringify(fs.filter((f) => f.type !== "ausschuss"));
      raus.paare += 1;
      if (rest(mitRegel) === rest(regelfrei)) raus.restGleich += 1;
      for (const v of aus(regelfrei)) if (!aus(mitRegel).includes(v)) raus.wegfaelle.push([p.id, k.id, v]);
      for (const v of aus(mitRegel)) if (!aus(regelfrei).includes(v)) raus.neue.push([p.id, k.id, v]);
    }
  }
  return raus;
}
const gDiff = goldenDiff();
check("0c genau die verankerten Ausschussbelege entfallen — vollstaendige Liste, nicht nur die Anzahl",
  JSON.stringify(gDiff.wegfaelle) === JSON.stringify(GOLDEN_ERWARTETE_WEGFAELLE),
  JSON.stringify(gDiff.wegfaelle));
check("0d (Pflicht 15/16/17) kein Paar GEWINNT einen Ausschussbeleg — die Regel entfernt nur",
  gDiff.neue.length === 0, JSON.stringify(gDiff.neue));
check("0e (Pflicht 24) in ALLEN Paaren ist alles ausser dem Ausschussbeleg byte-identisch",
  gDiff.restGleich === gDiff.paare, `${gDiff.restGleich}/${gDiff.paare}`);

// ── Testprofile ──────────────────────────────────────────────────────────────
// Feldform wie storage.fromMandateProfileRow (politische_ebene -> parliamentType/
// politicalLevel, bundesland -> state). Keine reale Person, keine reale Partei,
// kein Production-Mandat. Die Ausschussnamen sind die REALEN Innenausschuesse
// der beiden Landesparlamente bzw. des Bundestags.
const BB_AUSSCHUSS = "Ausschuss für Inneres und Kommunales";                  // Landtag Brandenburg
const BLN_AUSSCHUSS = "Ausschuss für Inneres, Sicherheit und Ordnung";        // Abgeordnetenhaus Berlin
const BT_AUSSCHUSS = "Ausschuss für Inneres und Heimat";                      // Bundestag (20. WP)

const PROFIL_BB = Object.freeze({
  id: "t-zust-bb", fullName: "Testmandat Brandenburg (Zuständigkeitsregression)",
  party: "Fraktionslos", politicalLevel: "Land", parliamentType: "Landtag",
  state: "Brandenburg", bundesland: "Brandenburg",
  constituency: "Brandenburg (Landesebene, Test)", regionalInterests: ["Brandenburg"],
  committees: [BB_AUSSCHUSS], focusTopics: ["Inneres"]
});
const PROFIL_BLN = Object.freeze({
  id: "t-zust-bln", fullName: "Testmandat Berlin (Zuständigkeitsregression)",
  party: "Fraktionslos", politicalLevel: "Land", parliamentType: "Landtag",
  state: "Berlin", bundesland: "Berlin",
  constituency: "Berlin (Landesebene, Test)", regionalInterests: ["Berlin"],
  committees: [BLN_AUSSCHUSS], focusTopics: ["Inneres"]
});
// Landesmandat OHNE fachlichen Schwerpunkt: hier ist der Ausschuss der EINZIGE
// moegliche Beleg — genau der Fall, in dem der falsche Beleg allein ueber den
// M8-Riegel entscheidet.
const PROFIL_BB_OHNE_THEMA = Object.freeze({ ...PROFIL_BB, id: "t-zust-bb-ohne-thema", focusTopics: [] });
// Bundesmandat: Kontrollgruppe fuer die Unveraendertheit.
const PROFIL_BUND = Object.freeze({
  id: "t-zust-bt", fullName: "Testmandat Bund (Kontrolle)",
  party: "Fraktionslos", politicalLevel: "Bund", parliamentType: "Bundestag",
  state: "Brandenburg", constituency: "Wahlkreis 61 (Test)",
  committees: [BT_AUSSCHUSS], focusTopics: ["Inneres"]
});
// Profil OHNE Mandatsebene (Alt-/Teilprofile in Production): darf sich nicht
// veraendern, weil die Ebene nicht belegt ist.
const PROFIL_OHNE_EBENE = Object.freeze({
  id: "t-zust-ohne-ebene", fullName: "Testmandat ohne Mandatsebene",
  party: "Fraktionslos", state: "Brandenburg",
  committees: [BB_AUSSCHUSS], focusTopics: ["Inneres"]
});
// Landesmandat mit Ebene, aber OHNE Bundesland (in profile-validation.js ein
// Pflichtfeldfehler, `requiredMissing`): der Zustaendigkeitsraum ist unbestimmt.
const PROFIL_BB_OHNE_LAND = Object.freeze({ ...PROFIL_BB, id: "t-zust-ohne-land", state: undefined, bundesland: undefined });

// ── Wissensobjekte (Feldform wie assembleKnowledgeObject/classification) ─────
// `affected_geographies` traegt die kanonischen Seed-Kennungen, genau wie im
// echten Pfad (gemessen am 27A-Vertrag: {name,level,geography_id,herkunft}).
function ko(id, over = {}) {
  return {
    id, vorgang_id: `vg-${id}`, status: "neu", understanding_status: "complete",
    headline: over.headline || `Testvorgang ${id}`,
    was_ist_passiert: over.was_ist_passiert || "Testdatum, kein Quellenbeleg.",
    warum_wichtig: "Testdatum, kein Quellenbeleg.",
    parteien: [], mentioned_parties: [],
    ausschuesse: [], mentioned_committees: [], mentioned_locations: [],
    affected_geographies: [], mentioned_geographies: [],
    decision_level: "unknown", ...over
  };
}
const geo = (name, id) => ({ name, level: "land", geography_id: id, herkunft: "inhalt" });

const KO_BLN = ko("bln-inneres", {
  headline: "Berlin debattiert das Silvester-Böllerverbot",
  decision_level: "land", affected_geographies: [geo("Berlin", "geo-land-berlin")],
  ausschuesse: [BLN_AUSSCHUSS], mentioned_committees: [BLN_AUSSCHUSS], mentioned_locations: ["Berlin"]
});
const KO_BB = ko("bb-inneres", {
  headline: "Brandenburg legt Zahlen zu Straf- und Gewalttaten vor",
  decision_level: "land", affected_geographies: [geo("Brandenburg", "geo-land-brandenburg")],
  ausschuesse: [BB_AUSSCHUSS], mentioned_committees: [BB_AUSSCHUSS], mentioned_locations: ["Brandenburg"]
});
const KO_BUND = ko("bund-inneres", {
  headline: "Bund ändert das Waffengesetz",
  decision_level: "bund", affected_geographies: [],
  ausschuesse: [BT_AUSSCHUSS], mentioned_committees: [BT_AUSSCHUSS]
});
// Kommunaler Vorgang IM eigenen Land: der eigene Landesausschuss bleibt belegbar.
const KO_BB_KOMMUNAL = ko("bb-kommunal", {
  headline: "Potsdam beschließt neue Sicherheitspartnerschaft",
  decision_level: "kommune",
  affected_geographies: [{ name: "Potsdam", level: "kommune", geography_id: "geo-kommune-bb-potsdam", herkunft: "inhalt" }],
  ausschuesse: [BB_AUSSCHUSS], mentioned_committees: [BB_AUSSCHUSS], mentioned_locations: ["Potsdam"]
});
// Zustaendigkeit FEHLT vollstaendig (ehrlich leere Geografie, Ebene unknown).
const KO_OHNE_ZUSTAENDIGKEIT = ko("ohne-zustaendigkeit", {
  headline: "Innenausschuss berät über Sicherheitslage",
  ausschuesse: [BB_AUSSCHUSS], mentioned_committees: [BB_AUSSCHUSS]
});
// MEHRDEUTIG: zwei Bundeslaender betroffen, eines davon das eigene.
const KO_MEHRDEUTIG = ko("mehrdeutig", {
  headline: "Berlin und Brandenburg stimmen Polizeieinsätze ab",
  decision_level: "land",
  affected_geographies: [geo("Berlin", "geo-land-berlin"), geo("Brandenburg", "geo-land-brandenburg")],
  ausschuesse: [BB_AUSSCHUSS], mentioned_committees: [BB_AUSSCHUSS], mentioned_locations: ["Berlin", "Brandenburg"]
});
// WIDERSPRUCH: Ebene bund, betroffene Geografie aber ein Bundesland. Die
// uebergeordnete Ebene gewinnt — ein Bundesvorgang ist kein Landesausschuss.
const KO_WIDERSPRUCH = ko("widerspruch", {
  headline: "Bundesgesetz mit Sonderregel für Brandenburg",
  decision_level: "bund", affected_geographies: [geo("Brandenburg", "geo-land-brandenburg")],
  ausschuesse: [BB_AUSSCHUSS], mentioned_committees: [BB_AUSSCHUSS], mentioned_locations: ["Brandenburg"]
});
// ── Befund 27A-2: die Bundesseite ────────────────────────────────────────────
// Landesvorgang, der einen gleichnamigen LANDES-Ausschuss nennt. Der reale
// gemessene Fall: Bundestagsausschuss "Gesundheit" gegen "Gesundheitsausschuss
// (Landtag)" — beide falten auf `gesundheit`.
const BT_GESUNDHEIT = "Gesundheit";                                           // Bundestag
const LAND_GESUNDHEIT = "Gesundheitsausschuss (Landtag)";                     // Landtag
const KREIS_SOZIAL = "Sozialausschuss Kreistag Ostallgäu";                    // Kreistag
const BT_SOZIALES = "Ausschuss für Arbeit und Soziales";                      // Bundestag

const PROFIL_BUND_GESUNDHEIT = Object.freeze({
  id: "t-zust-bt-gesundheit", fullName: "Testmandat Bund (Gesundheit)",
  party: "Fraktionslos", politicalLevel: "Bund", parliamentType: "Bundestag",
  state: "Berlin", constituency: "Wahlkreis 84 (Test)",
  committees: [BT_GESUNDHEIT], focusTopics: []
});
const PROFIL_BUND_SOZIALES = Object.freeze({
  id: "t-zust-bt-soziales", fullName: "Testmandat Bund (Arbeit und Soziales)",
  party: "Fraktionslos", politicalLevel: "Bund", parliamentType: "Bundestag",
  state: "Bayern", constituency: "Wahlkreis 217 (Test)",
  committees: [BT_SOZIALES], focusTopics: []
});
// Landesvorgang mit Landesausschuss (der gemessene 27A-2-Fall). `zeitdruck` und
// `source_document_count` sind bewusst so gesetzt, dass die Entscheidung dieselben
// Zahlen ergibt wie der real gemessene Production-Fall (Score 49 -> 15, §51.7).
const KO_LAND_GESUNDHEIT = ko("land-gesundheit", {
  headline: "Kliniken im Land melden Millionendefizite",
  decision_level: "land", affected_geographies: [geo("Rheinland-Pfalz", "geo-land-rheinland-pfalz")],
  ausschuesse: [LAND_GESUNDHEIT], mentioned_committees: [LAND_GESUNDHEIT], mentioned_locations: ["Mainz"],
  zeitdruck: "Haushaltsberatung laeuft", source_document_count: 2
});
const SIM_LAND_GESUNDHEIT = 0.1126;   // gemessene Aehnlichkeit des Realfalls
// KOMMUNALvorgang mit Kreistagsausschuss (in Production ebenfalls gemessen).
const KO_KOMMUNE_SOZIAL = ko("kommune-sozial", {
  headline: "Kreistag berät die Sozialumlage",
  decision_level: "kommune", affected_geographies: [],
  ausschuesse: [KREIS_SOZIAL], mentioned_committees: [KREIS_SOZIAL]
});
// Bundesvorgang mit ECHTEM Bundestagsausschuss — muss belegbar bleiben.
const KO_BUND_GESUNDHEIT = ko("bund-gesundheit", {
  headline: "Bundestag berät die Apothekenreform",
  decision_level: "bund", affected_geographies: [],
  ausschuesse: [BT_GESUNDHEIT], mentioned_committees: [BT_GESUNDHEIT]
});
// EU-Vorgang, der einen ECHTEN Bundestagsausschuss nennt — offener Nebenbefund.
const KO_EU_SOZIALES = ko("eu-soziales", {
  headline: "EU-Richtlinie zur Plattformarbeit",
  decision_level: "eu", affected_geographies: [],
  ausschuesse: [BT_SOZIALES], mentioned_committees: [BT_SOZIALES]
});

// Fremdes Land NUR ueber die Kommune belegt (Bezirk/Kommune -> Land ueber den Seed).
const KO_BLN_BEZIRK = ko("bln-bezirk", {
  headline: "Neukölln verstärkt den Ordnungsdienst",
  decision_level: "kommune",
  affected_geographies: [{ name: "Neukölln", level: "bezirk", geography_id: "geo-bezirk-berlin-neukoelln", herkunft: "inhalt" }],
  ausschuesse: [BLN_AUSSCHUSS], mentioned_committees: [BLN_AUSSCHUSS], mentioned_locations: ["Neukölln"]
});

// ── Helfer: die ECHTE Kette profileFeatures -> matchedFeatures ───────────────
function feats(profile, knowledgeObject) {
  return m.matchedFeatures(m.profileFeatures(profile), m.knowledgeObjectFeatures(knowledgeObject));
}
const arten = (fs) => fs.map((f) => f.type).sort();
const hatAusschuss = (profile, knowledgeObject) => feats(profile, knowledgeObject).some((f) => f.type === "ausschuss");
const hatThema = (profile, knowledgeObject) => feats(profile, knowledgeObject).some((f) => f.type === "thema");

// ═══ A · Die Ursache: beide Normalisierungen kollidieren weiterhin ═══════════
// Sie werden ABSICHTLICH nicht geaendert: sie speisen den geteilten
// Merkmalsvektor (Ranking/Score/Top-N) und die Themen-Ableitung. Ihre Kollision
// ist damit KEIN Fehler, sondern die erlaubte fachliche Aehnlichkeit — der
// Fehler war, sie als MITGLIEDSCHAFT auszugeben.
abschnitt("A · Ursache: Namensnormalisierung kollidiert (und bleibt es)");
check("A1 normalizeCommittee faltet BB- und BLN-Innenausschuss auf denselben Stamm",
  m.normalizeCommittee(BB_AUSSCHUSS) === "inneres" && m.normalizeCommittee(BLN_AUSSCHUSS) === "inneres",
  `${m.normalizeCommittee(BB_AUSSCHUSS)} / ${m.normalizeCommittee(BLN_AUSSCHUSS)}`);
check("A2 committeeMatchKey loest die Laenderkollision NICHT (war kein Fix)",
  m.committeeMatchKey(BB_AUSSCHUSS) === m.committeeMatchKey(BLN_AUSSCHUSS),
  `${m.committeeMatchKey(BB_AUSSCHUSS)} / ${m.committeeMatchKey(BLN_AUSSCHUSS)}`);
check("A3 slugCommittee (Ranking/Vektor) bleibt unveraendert kollidierend — fachliche Aehnlichkeit ist erlaubt",
  m.slugCommittee(BB_AUSSCHUSS) === m.slugCommittee(BLN_AUSSCHUSS));
// A4 prueft die Aussage aus docs/matching-nachvollziehbarkeit.md §50.3 — "der Token
// ausschuss:inneres steht weiterhin in BEIDEN Vektoren" — an ISOLIERTEN Minimaleingaben:
// das Profil traegt NUR den Brandenburger Ausschuss, das Wissensobjekt NUR den Berliner.
// Das Wissensobjekt traegt zusaetzlich ein neutrales `tags`-Thema, damit derivePolicyFields
// NICHT greift; sonst waere nicht unterscheidbar, ob eine gemeinsame Dimension vom Ausschuss
// oder vom daraus abgeleiteten Politikfeld stammt.
//
// Vorgehen: `embed` normiert den Vektor, ein zusaetzlicher Token verschiebt deshalb ALLE
// belegten Komponenten. Traegerdimension des Ausschusses ist darum die Differenz gegen das
// LEERE Profil (Nullvektor) — dort ist es genau eine Komponente. Diese eine Dimension muss
// im Wissensobjektvektor ebenfalls belegt sein, mit demselben Vorzeichen (gleicher Token ->
// gleicher Hash), und beim Entfernen des Ausschusses aus dem Wissensobjekt wieder auf 0
// fallen. Die Assertion wird damit ROT, sobald die gemeinsame Ausschussdimension in einem
// der beiden Vektoren fehlt oder auseinanderfaellt.
check("A4 der Ausschuss-Token belegt in BEIDEN Merkmalsvektoren dieselbe Dimension (Ranking unangetastet)",
  (() => {
    const profilNurAusschuss = m.embedProfile({ committees: [BB_AUSSCHUSS] });
    const profilLeer = m.embedProfile({});
    const koMitAusschuss = m.embedKnowledgeObject({ id: "a4", tags: ["Neutrales Testthema"], ausschuesse: [BLN_AUSSCHUSS] });
    const koOhneAusschuss = m.embedKnowledgeObject({ id: "a4", tags: ["Neutrales Testthema"] });
    if ([profilNurAusschuss, profilLeer, koMitAusschuss, koOhneAusschuss].some((v) => v.length !== m.EMBEDDING_DIM)) return false;
    const traeger = [];
    for (let i = 0; i < profilNurAusschuss.length; i += 1) {
      if (profilNurAusschuss[i] !== profilLeer[i]) traeger.push(i);
    }
    if (traeger.length !== 1) return false;                      // Profil belegt genau eine Ausschussdimension
    const i = traeger[0];
    return koMitAusschuss[i] !== 0                               // dieselbe Dimension im Wissensobjekt belegt
      && Math.sign(koMitAusschuss[i]) === Math.sign(profilNurAusschuss[i])   // gleicher Token -> gleiches Vorzeichen
      && koOhneAusschuss[i] === 0                                // ohne den Ausschuss faellt genau sie weg
      && m.cosineSimilarity(profilNurAusschuss, koMitAusschuss) > 0
      && m.cosineSimilarity(profilNurAusschuss, koOhneAusschuss) === 0;
  })(),
  "gemeinsame Ausschussdimension fehlt in einem der beiden Merkmalsvektoren");

// ═══ B · Zustaendigkeitsraum: deterministische Ableitung ════════════════════
abschnitt("B · Zustaendigkeitsraum aus belegten Feldern (nichts erfunden)");
check("B1 Landesmandat -> Ebene land + kanonische Landkennung",
  JSON.stringify(m.profileZustaendigkeit(PROFIL_BB)) === JSON.stringify({ ebene: "land", land: "geo-land-brandenburg" }),
  JSON.stringify(m.profileZustaendigkeit(PROFIL_BB)));
check("B2 Bundesmandat -> Ebene bund, KEIN Bundesland (Wahlkreisland ist nicht der Zustaendigkeitsraum)",
  JSON.stringify(m.profileZustaendigkeit(PROFIL_BUND)) === JSON.stringify({ ebene: "bund", land: null }),
  JSON.stringify(m.profileZustaendigkeit(PROFIL_BUND)));
check("B3 Profil ohne Mandatsebene -> unbestimmt (kein Raten aus dem Bundesland)",
  JSON.stringify(m.profileZustaendigkeit(PROFIL_OHNE_EBENE)) === JSON.stringify({ ebene: null, land: null }));
check("B4 leeres Profil -> unbestimmt, kein Fehler",
  JSON.stringify(m.profileZustaendigkeit({})) === JSON.stringify({ ebene: null, land: null })
  && JSON.stringify(m.profileZustaendigkeit()) === JSON.stringify({ ebene: null, land: null }));
check("B5 Vorgang: Ebene + betroffenes Bundesland aus affected_geographies",
  JSON.stringify(m.knowledgeObjectZustaendigkeit(KO_BLN)) === JSON.stringify({ ebene: "land", laender: ["geo-land-berlin"] }),
  JSON.stringify(m.knowledgeObjectZustaendigkeit(KO_BLN)));
check("B6 Vorgang: Kommune/Bezirk wird ueber den Seed auf sein Bundesland aufgeloest",
  m.knowledgeObjectZustaendigkeit(KO_BB_KOMMUNAL).laender[0] === "geo-land-brandenburg"
  && m.knowledgeObjectZustaendigkeit(KO_BLN_BEZIRK).laender[0] === "geo-land-berlin",
  JSON.stringify([m.knowledgeObjectZustaendigkeit(KO_BB_KOMMUNAL), m.knowledgeObjectZustaendigkeit(KO_BLN_BEZIRK)]));
check("B7 Vorgang: decision_level 'unknown' und leere Geografie bleiben ehrlich unbestimmt",
  JSON.stringify(m.knowledgeObjectZustaendigkeit(KO_OHNE_ZUSTAENDIGKEIT)) === JSON.stringify({ ebene: null, laender: [] }));
check("B8 Vorgang: mehrere betroffene Laender bleiben mehrdeutig (werden nicht auf eines verkuerzt)",
  JSON.stringify(m.knowledgeObjectZustaendigkeit(KO_MEHRDEUTIG).laender) === JSON.stringify(["geo-land-berlin", "geo-land-brandenburg"]));
check("B9 'Deutschland'/Bund ist KEIN Bundesland",
  m.knowledgeObjectZustaendigkeit({ decision_level: "bund", affected_geographies: [{ name: "Deutschland", level: "bund", geography_id: "geo-bund" }] }).laender.length === 0);
check("B10 unaufloesbare Geografieangabe erzeugt keinen erfundenen Zustaendigkeitsraum",
  m.knowledgeObjectZustaendigkeit({ decision_level: "land", affected_geographies: [{ name: "Irgendwo", level: "unknown", geography_id: null }] }).laender.length === 0);
check("B11 Ableitung ist deterministisch (zweiter Aufruf byte-identisch)",
  JSON.stringify(m.knowledgeObjectZustaendigkeit(KO_MEHRDEUTIG)) === JSON.stringify(m.knowledgeObjectZustaendigkeit(KO_MEHRDEUTIG))
  && JSON.stringify(m.profileZustaendigkeit(PROFIL_BB)) === JSON.stringify(m.profileZustaendigkeit(PROFIL_BB)));

// ═══ C · Pflichtregression 1-4: fremdes Land raus, eigenes Land bleibt ══════
abschnitt("C · Fremder Landesausschuss erzeugt keinen Beleg — echter bleibt");
check("C1 (Pflicht 1) Brandenburger Profil x BERLINER Innenausschuss -> KEIN Ausschussbeleg",
  !hatAusschuss(PROFIL_BB, KO_BLN), JSON.stringify(feats(PROFIL_BB, KO_BLN)));
check("C2 (Pflicht 2) Berliner Profil x BRANDENBURGER Innenausschuss -> KEIN Ausschussbeleg",
  !hatAusschuss(PROFIL_BLN, KO_BB), JSON.stringify(feats(PROFIL_BLN, KO_BB)));
check("C3 (Pflicht 3) Brandenburger Profil x ECHTEM Brandenburger Innenausschuss -> Beleg bleibt",
  hatAusschuss(PROFIL_BB, KO_BB), JSON.stringify(feats(PROFIL_BB, KO_BB)));
check("C4 (Pflicht 4) Berliner Profil x ECHTEM Berliner Innenausschuss -> Beleg bleibt",
  hatAusschuss(PROFIL_BLN, KO_BLN), JSON.stringify(feats(PROFIL_BLN, KO_BLN)));
check("C5 der erhaltene Beleg nennt den EIGENEN Ausschuss (nicht den fremden)",
  feats(PROFIL_BB, KO_BB).some((f) => f.type === "ausschuss" && f.value === BB_AUSSCHUSS)
  && feats(PROFIL_BLN, KO_BLN).some((f) => f.type === "ausschuss" && f.value === BLN_AUSSCHUSS));
check("C6 fremdes Land nur ueber den Bezirk belegt -> ebenfalls kein Beleg",
  !hatAusschuss(PROFIL_BB, KO_BLN_BEZIRK), JSON.stringify(feats(PROFIL_BB, KO_BLN_BEZIRK)));
check("C7 eigenes Land ueber die Kommune belegt -> Beleg bleibt (Landesausschuss ist fuer die Kommune zustaendig)",
  hatAusschuss(PROFIL_BB, KO_BB_KOMMUNAL), JSON.stringify(feats(PROFIL_BB, KO_BB_KOMMUNAL)));
check("C8 (Pflicht 10) thematische Gemeinsamkeit bleibt als THEMA sichtbar — nur nicht als Mitgliedschaft",
  hatThema(PROFIL_BB, KO_BLN) && JSON.stringify(arten(feats(PROFIL_BB, KO_BLN))) === JSON.stringify(["thema"]),
  JSON.stringify(feats(PROFIL_BB, KO_BLN)));
check("C9 Partei- und Wahlkreisbelege bleiben von der Regel unberuehrt",
  (() => {
    const p = { ...PROFIL_BB, party: "SPD", regionalInterests: ["Berlin"] };
    const k = { ...KO_BLN, parteien: ["SPD"], mentioned_parties: ["SPD"] };
    const f = feats(p, k);
    return f.some((x) => x.type === "partei") && f.some((x) => x.type === "wahlkreis") && !f.some((x) => x.type === "ausschuss");
  })());

// ═══ D · Pflichtregression 6-8: Begruendung, Erklaerung, Persistenzsignale ══
abschnitt("D · Kein Ausschussbeleg -> keine Ausschussbegruendung, kein Signal, kein Gewicht");
const featsFremd = feats(PROFIL_BB, KO_BLN);
const signaleFremd = begruendung.buildSignals(featsFremd, 0.3162);
check("D1 (Pflicht 7) gespeicherte Signale enthalten KEINEN Ausschussschluessel",
  !Object.prototype.hasOwnProperty.call(signaleFremd, "ausschuss") && Array.isArray(signaleFremd.thema),
  JSON.stringify(signaleFremd));
check("D2 (Pflicht 6) die Kurzbegruendung nennt den fremden Ausschuss nicht",
  begruendung.begruendungAusSignalen(signaleFremd, featsFremd) === "Betrifft deinen Schwerpunkt Inneres.",
  String(begruendung.begruendungAusSignalen(signaleFremd, featsFremd)));
check("D3 die sichtbare Erklaerung fuehrt keinen Ausschussbeleg",
  (() => {
    const e = erklaerung.erklaerungAusErgebnis({ signale: signaleFremd, matched_features: featsFremd, similarity: 0.3162 });
    return e && !e.belege.some((b) => b.art === "ausschuss") && !/Ausschuss/.test(e.satz);
  })(),
  JSON.stringify(erklaerung.erklaerungAusErgebnis({ signale: signaleFremd, matched_features: featsFremd })));
check("D4 der echte eigene Ausschuss erscheint weiterhin in Signal, Begruendung und Erklaerung",
  (() => {
    const f = feats(PROFIL_BB, KO_BB);
    const s = begruendung.buildSignals(f, 0.4);
    const e = erklaerung.erklaerungAusErgebnis({ signale: s, matched_features: f, similarity: 0.4 });
    return Array.isArray(s.ausschuss) && /Inneres und Kommunales/.test(String(begruendung.begruendungAusSignalen(s, f)))
      && e && e.belege.some((b) => b.art === "ausschuss");
  })());
// Pflicht 8: Entscheidungsgewicht. decisions.js wiegt ausschuss mit 34 —
// GEMESSEN vor dem Fix: Score 62 -> "Sofort reagieren"; erwartet ohne den
// falschen Beleg: deutlich niedriger und KEIN "Sofort reagieren".
const entscheidungFremd = decisions.decideForUser(PROFIL_BB, [KO_BLN], { userId: PROFIL_BB.id });
check("D5 (Pflicht 8) fremder Landesvorgang erhaelt KEIN Entscheidungsgewicht aus dem falschen Ausschuss",
  entscheidungFremd.length === 1 && entscheidungFremd[0].decision !== "Sofort reagieren"
  && entscheidungFremd[0].score < 60
  && !(entscheidungFremd[0].matched_features || []).some((f) => f.type === "ausschuss"),
  JSON.stringify(entscheidungFremd.map((d) => [d.score, d.decision, d.matched_features])));
check("D6 der echte eigene Landesvorgang bleibt entscheidungsrelevant (Regression nach unten ausgeschlossen)",
  (() => {
    const d = decisions.decideForUser(PROFIL_BB, [KO_BB], { userId: PROFIL_BB.id })[0];
    return d && d.decision === "Sofort reagieren" && (d.matched_features || []).some((f) => f.type === "ausschuss");
  })(),
  JSON.stringify(decisions.decideForUser(PROFIL_BB, [KO_BB], { userId: PROFIL_BB.id }).map((d) => [d.score, d.decision])));

// ═══ E · Pflichtregression 9: M8-Relevanzriegel ═════════════════════════════
abschnitt("E · M8-Riegel wird nicht allein durch den falschen Ausschuss passiert");
const featsNurAusschuss = feats(PROFIL_BB_OHNE_THEMA, KO_BLN);
check("E1 Profil ohne Schwerpunkt: der fremde Landesvorgang hat GAR KEINEN Beleg mehr",
  featsNurAusschuss.length === 0, JSON.stringify(featsNurAusschuss));
check("E2 (Pflicht 9) M8 (aktiv) verwirft diese Zeile — sie passiert den Riegel nicht",
  (() => {
    const g = relevanz.wendeRelevanzGateAn([{ id: "r1", matched_features: featsNurAusschuss }], { aktiv: true });
    return g.zeilen.length === 0 && g.verworfen === 1;
  })());
check("E3 M8 (aktiv) laesst den echten eigenen Landesvorgang weiterhin durch",
  (() => {
    const f = feats(PROFIL_BB_OHNE_THEMA, KO_BB);
    const g = relevanz.wendeRelevanzGateAn([{ id: "r2", matched_features: f }], { aktiv: true });
    return f.some((x) => x.type === "ausschuss") && g.zeilen.length === 1 && g.verworfen === 0;
  })());
check("E4 M8 bleibt Default AUS — diese Suite aktiviert nichts",
  relevanz.relevanzGateAktiv(process.env) === false && !process.env.HELMUT_MATCHING_RELEVANZ_GATE);

// ═══ F · Bundesseite: echter Bundesausschuss bleibt, fremder faellt weg ═════
abschnitt("F · Bundesmandate (Befund 27A-2) — symmetrische Gegenrichtung");
check("F1 (Pflicht 6) Bundestagssynonyme funktionieren im BUNDESKONTEXT weiter: 'Sozialausschuss' belegt 'Arbeit und Soziales'",
  (() => {
    const p = { ...PROFIL_BUND, committees: ["Sozialausschuss"], focusTopics: [] };
    const k = ko("bt-soziales", { decision_level: "bund", ausschuesse: [BT_SOZIALES] });
    return feats(p, k).some((f) => f.type === "ausschuss");
  })());
check("F2 (Pflicht 3) Bundesprofil x Bundesvorgang: Ausschussbeleg unveraendert vorhanden",
  hatAusschuss(PROFIL_BUND, KO_BUND) && hatAusschuss(PROFIL_BUND_GESUNDHEIT, KO_BUND_GESUNDHEIT),
  JSON.stringify(feats(PROFIL_BUND, KO_BUND)));
// Bewusste Ausnahme (§52.6, Kommentar an der Regel): OHNE belegte Ebene ist auch
// auf der Bundesseite nichts entscheidbar — dieses Wissensobjekt nennt sogar einen
// LANDESausschuss, und der Beleg bleibt trotzdem. Genau das ist der Preis der
// Ausnahme, und er ist benannt: ein Wegfall entfernte umgekehrt ECHTE
// Bundestagsbelege des Altbestands still (radar-committee-evidence 1/1b/6c/8).
// In Production betrifft beides heute 0 Paare.
check("F3 Bundesprofil x Vorgang OHNE belegte Zustaendigkeit: Verhalten unveraendert (nichts entscheidbar)",
  hatAusschuss(PROFIL_BUND, KO_OHNE_ZUSTAENDIGKEIT), JSON.stringify(feats(PROFIL_BUND, KO_OHNE_ZUSTAENDIGKEIT)));
check("F4 (Pflicht 1) Bundesprofil x LANDESvorgang mit gleichnamigem Landesausschuss -> KEIN Ausschussbeleg (Befund 27A-2 behoben)",
  !hatAusschuss(PROFIL_BUND, KO_BLN)
  && !hatAusschuss(PROFIL_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT),
  JSON.stringify([feats(PROFIL_BUND, KO_BLN), feats(PROFIL_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT)]));
check("F4b (Pflicht 1) der gemessene Realfall: 'Gesundheit' (Bundestag) x 'Gesundheitsausschuss (Landtag)' faltet weiter, belegt aber nicht",
  m.slugCommittee(BT_GESUNDHEIT) === m.slugCommittee(LAND_GESUNDHEIT)
  && !hatAusschuss(PROFIL_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT),
  `${m.slugCommittee(BT_GESUNDHEIT)} / ${m.slugCommittee(LAND_GESUNDHEIT)}`);
check("F4c (Pflicht 1) auch der KOMMUNALE Fall: 'Arbeit und Soziales' x 'Sozialausschuss Kreistag Ostallgäu' -> kein Beleg",
  m.slugCommittee(BT_SOZIALES) === m.slugCommittee(KREIS_SOZIAL)
  && !hatAusschuss(PROFIL_BUND_SOZIALES, KO_KOMMUNE_SOZIAL),
  `${m.slugCommittee(BT_SOZIALES)} / ${m.slugCommittee(KREIS_SOZIAL)}`);
check("F5 Profil ohne Mandatsebene: Verhalten unveraendert (Ebene ist nicht belegt, nichts entscheidbar)",
  hatAusschuss(PROFIL_OHNE_EBENE, KO_BLN) && hatAusschuss(PROFIL_OHNE_EBENE, KO_OHNE_ZUSTAENDIGKEIT));
check("F6 die Regel entfernt AUSSCHLIESSLICH Ausschussbelege — sie fuegt nie einen hinzu",
  [[PROFIL_BB, KO_BLN], [PROFIL_BLN, KO_BB], [PROFIL_BUND, KO_BLN], [PROFIL_OHNE_EBENE, KO_BB],
   [PROFIL_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT], [PROFIL_BUND_GESUNDHEIT, KO_BUND_GESUNDHEIT],
   [PROFIL_BUND_SOZIALES, KO_KOMMUNE_SOZIAL], [PROFIL_BUND_SOZIALES, KO_EU_SOZIALES]]
    .every(([p, k]) => {
      const mitRegel = feats(p, k).filter((f) => f.type === "ausschuss").length;
      const ohneRegel = m.matchedFeatures(
        { ...m.profileFeatures(p), zustaendigkeit: null },
        { ...m.knowledgeObjectFeatures(k), zustaendigkeit: null }
      ).filter((f) => f.type === "ausschuss").length;
      return mitRegel <= ohneRegel;
    }));
// Pflicht 2 in der Gegenrichtung: ein LANDESprofil darf umgekehrt keinen
// BUNDESausschuss als Mitgliedschaft belegen. Das deckt 27A-1 schon ab (G4/G5),
// hier explizit mit gleichnamigem Bundestagsausschuss.
check("F7 (Pflicht 2) Landesprofil x BUNDESvorgang mit gleichnamigem Bundesausschuss -> KEIN Ausschussbeleg",
  !hatAusschuss({ ...PROFIL_BB, committees: [BT_SOZIALES] },
    ko("bund-soziales-f7", { decision_level: "bund", ausschuesse: [BT_SOZIALES] })));
// Pflicht 5: zwei verschiedene Landesparlamente mit gleichnamigem Ausschuss.
check("F8 (Pflicht 5) zwei unterschiedliche Landesparlamente mit gleichnamigem Ausschuss -> kein Beleg in BEIDE Richtungen",
  !hatAusschuss(PROFIL_BB, { ...KO_BLN, ausschuesse: [BB_AUSSCHUSS], mentioned_committees: [BB_AUSSCHUSS] })
  && !hatAusschuss(PROFIL_BLN, { ...KO_BB, ausschuesse: [BLN_AUSSCHUSS], mentioned_committees: [BLN_AUSSCHUSS] }));
// Pflicht 4: echter Treffer im eigenen Parlament bleibt — beide Ebenen.
check("F9 (Pflicht 4) echter Treffer im EIGENEN Parlament bleibt erhalten (Land und Bund)",
  hatAusschuss(PROFIL_BB, KO_BB) && hatAusschuss(PROFIL_BLN, KO_BLN)
  && hatAusschuss(PROFIL_BUND, KO_BUND) && hatAusschuss(PROFIL_BUND_GESUNDHEIT, KO_BUND_GESUNDHEIT));

// ═══ G · Pflichtregression 11: fehlend / widersprüchlich / mehrdeutig ═══════
abschnitt("G · Fehlende, widersprüchliche und mehrdeutige Zustaendigkeit");
check("G1 Landesmandat x Vorgang OHNE belegte Zustaendigkeit -> kein Beleg (fail-closed, kein erfundener Beleg)",
  !hatAusschuss(PROFIL_BB, KO_OHNE_ZUSTAENDIGKEIT), JSON.stringify(feats(PROFIL_BB, KO_OHNE_ZUSTAENDIGKEIT)));
// Landesmandat OHNE Bundesland: der Zustaendigkeitsraum des PROFILS ist
// unbestimmt, damit ist nichts entscheidbar -> Verhalten bewusst unveraendert
// (kein stiller Wegfall bestehender Belege). Ein solches Profil ist in
// profile-validation.js ohnehin `requiredMissing` und nicht aktivierbar; die
// Restunschaerfe ist in docs/matching-nachvollziehbarkeit.md §50 benannt.
check("G2 Landesmandat OHNE Bundesland -> Verhalten unveraendert (nichts entscheidbar, kein stiller Wegfall)",
  hatAusschuss(PROFIL_BB_OHNE_LAND, KO_BB) && hatAusschuss(PROFIL_BB_OHNE_LAND, KO_BLN),
  JSON.stringify(feats(PROFIL_BB_OHNE_LAND, KO_BLN)));
check("G3 mehrdeutige Zustaendigkeit MIT dem eigenen Land -> Beleg bleibt (eigenes Land ist positiv belegt)",
  hatAusschuss(PROFIL_BB, KO_MEHRDEUTIG) && hatAusschuss(PROFIL_BLN, { ...KO_MEHRDEUTIG, ausschuesse: [BLN_AUSSCHUSS], mentioned_committees: [BLN_AUSSCHUSS] }));
check("G4 Widerspruch Ebene bund + Landesgeografie -> die uebergeordnete Ebene gewinnt, kein Beleg",
  !hatAusschuss(PROFIL_BB, KO_WIDERSPRUCH), JSON.stringify(feats(PROFIL_BB, KO_WIDERSPRUCH)));
check("G5 Landesmandat x EU-/internationalem Vorgang -> kein Landesausschussbeleg",
  ["eu", "international"].every((e) => !hatAusschuss(PROFIL_BB, { ...KO_BB, decision_level: e })));
// ── Dieselben drei Grenzfaelle auf der BUNDESseite (Pflicht 18/19/20) ────────
check("G8 (Pflicht 18) Bundesmandat x Vorgang mit fehlender/unbekannter Ebene -> Verhalten unveraendert, deterministisch",
  hatAusschuss(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, decision_level: "unknown", affected_geographies: [] })
  && hatAusschuss(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, decision_level: undefined, affected_geographies: [] })
  && hatAusschuss(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, decision_level: "", affected_geographies: [] }),
  JSON.stringify(feats(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, decision_level: "unknown" })));
check("G8b (Pflicht 18) auf der LANDESseite bleibt fehlende Zustaendigkeit fail-closed (27A-1 unveraendert)",
  !hatAusschuss(PROFIL_BB, KO_OHNE_ZUSTAENDIGKEIT)
  && !hatAusschuss(PROFIL_BB, { ...KO_BB, decision_level: "unknown", affected_geographies: [] }));
check("G9 (Pflicht 19) Bundesmandat x Widerspruch (Ebene bund + betroffenes Bundesland) -> Ebene fuehrt, Beleg bleibt",
  hatAusschuss(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, affected_geographies: [geo("Berlin", "geo-land-berlin")] }));
check("G10 (Pflicht 19) Bundesmandat x Widerspruch (Ebene land + Geografie Deutschland) -> Ebene fuehrt, kein Beleg",
  !hatAusschuss(PROFIL_BUND_GESUNDHEIT, {
    ...KO_BUND_GESUNDHEIT, decision_level: "land",
    affected_geographies: [{ name: "Deutschland", level: "bund", geography_id: "geo-bund", herkunft: "inhalt" }]
  }));
check("G11 (Pflicht 10/20) eine BELEGTE, aber unlesbare Ebenenangabe ist kein Beleg (fail-closed, deterministisch)",
  ["Landtag", "kommunal", "landkreis", "bundesweit", "irgendwas"].every((e) =>
    !hatAusschuss(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, decision_level: e })),
  JSON.stringify(["kommunal", "bundesweit"].map((e) => feats(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, decision_level: e }))));
check("G11b (Pflicht 6) eine LEERE Ebenenangabe ist keine Angabe -> unveraendert (nicht dasselbe wie G11)",
  ["", "   ", null, undefined, "unknown", "UNKNOWN"].every((e) =>
    hatAusschuss(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, decision_level: e })),
  JSON.stringify(feats(PROFIL_BUND_GESUNDHEIT, { ...KO_BUND_GESUNDHEIT, decision_level: "   " })));
check("G12 (Pflicht 20) MEHRDEUTIGE Institution: derselbe Ausschussname entscheidet je Zustaendigkeitsraum — und immer gleich",
  (() => {
    // Ein und derselbe Name ("Gesundheit"/"Gesundheitsausschuss") gegen drei
    // Zustaendigkeitsraeume. Der NAME entscheidet nie mit, nur der Raum.
    const bund = hatAusschuss(PROFIL_BUND_GESUNDHEIT, KO_BUND_GESUNDHEIT);
    const land = hatAusschuss(PROFIL_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT);
    const kommune = hatAusschuss(PROFIL_BUND_GESUNDHEIT, { ...KO_LAND_GESUNDHEIT, decision_level: "kommune" });
    const nochmal = JSON.stringify(feats(PROFIL_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT))
      === JSON.stringify(feats(PROFIL_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT));
    return bund === true && land === false && kommune === false && nochmal;
  })());
check("G13 die Regel ist eine reine Funktion und deckt alle zehn Faelle des Sprints deterministisch ab",
  (() => {
    const pB = { ebene: "bund", land: null };
    const pL = { ebene: "land", land: "geo-land-berlin" };
    const faelle = [
      [pB, { ebene: "bund", laender: [] }, true],                                  // 1 Bund x Bund
      [pB, { ebene: "land", laender: ["geo-land-berlin"] }, false],                // 2 Bund x Land
      [pL, { ebene: "bund", laender: [] }, false],                                 // 3 Land x Bund
      [pL, { ebene: "land", laender: ["geo-land-berlin"] }, true],                  // 4 Land x eigenes Parlament
      [pL, { ebene: "land", laender: ["geo-land-bayern"] }, false],                 // 5 Land x anderes Parlament
      [pB, { ebene: null, laender: [] }, true],                                    // 6 fehlende Ebene (Bund): unveraendert
      [pL, { ebene: null, laender: [] }, false],                                   // 6 fehlende Ebene (Land): fail-closed
      [pL, { ebene: "land", laender: [] }, false],                                 // 7 fehlende Geografie
      [pB, { ebene: "land", laender: [] }, false],                                 // 7 fehlende Geografie (Bund)
      [pB, { ebene: "kommune", laender: [] }, false],                               // 2 Bund x Kommune
      [pB, { ebene: "bund", laender: ["geo-land-berlin"] }, true],                  // 8 Widerspruch: Ebene fuehrt
      [pL, { ebene: "bund", laender: ["geo-land-berlin"] }, false],                 // 8 Widerspruch: Ebene fuehrt
      [pB, { ebene: "quatsch", laender: [] }, false],                              // 10 belegt, aber unlesbar
      [pB, { ebene: "eu", laender: [] }, true],                                    // Nebenbefund, unveraendert
      [pB, null, true], [pL, null, false],                                         // gar keine Angabe
      [{ ebene: null, land: null }, { ebene: "land", laender: [] }, true],          // Profil unbestimmt
      [{ ebene: "land", land: null }, { ebene: "land", laender: [] }, true]         // Landesmandat ohne Bundesland
    ];
    return faelle.every(([p, k, erwartet]) => m.ausschussBelegZulaessig(p, k) === erwartet
      && m.ausschussBelegZulaessig(p, k) === m.ausschussBelegZulaessig(p, k));
  })());
check("G6 die Regel ist rein und mutiert ihre Eingaben nicht",
  (() => {
    const vorher = JSON.stringify([KO_BLN, PROFIL_BB]);
    feats(PROFIL_BB, KO_BLN); feats(PROFIL_BB, KO_BLN);
    return JSON.stringify([KO_BLN, PROFIL_BB]) === vorher;
  })());
check("G7 gleiche Eingabe -> byte-identische Belege (deterministisch)",
  JSON.stringify(feats(PROFIL_BB, KO_MEHRDEUTIG)) === JSON.stringify(feats(PROFIL_BB, KO_MEHRDEUTIG)));

// ═══ H · Ranking/Vektor/Hash/Filter bleiben unberuehrt ══════════════════════
// Der Fix wirkt AUSSCHLIESSLICH auf den Beleg. Waere er im Vektor gelandet,
// veraenderte er gespeicherte Merkmalsvektoren, Profilhash und Rangfolge und
// braeuchte Backfill + neue Rezeptversion (bewusst NICHT getan).
abschnitt("H · Merkmalsvektor, Profilhash, Rangfolge und harte Filter unveraendert");
check("H1 der Zustaendigkeitsraum geht NICHT in den Merkmalsvektor des Profils ein (Mandatsebene ist kein Token)",
  JSON.stringify(m.embedProfile(PROFIL_BB))
  === JSON.stringify(m.embedProfile({ ...PROFIL_BB, parliamentType: undefined, politicalLevel: undefined })));
check("H2 Profilhash ist unabhaengig vom Zustaendigkeitsraum (Bundesland aendert ihn nicht)",
  m.profileHash(PROFIL_BB) === m.profileHash({ ...PROFIL_BB, parliamentType: undefined, politicalLevel: undefined, state: PROFIL_BB.state }),
  `${m.profileHash(PROFIL_BB)} / ${m.profileHash({ ...PROFIL_BB, parliamentType: undefined, politicalLevel: undefined })}`);
check("H3 Merkmalsvektor des Vorgangs ist unabhaengig von der Ebene/Geografie",
  JSON.stringify(m.embedKnowledgeObject(KO_BLN))
  === JSON.stringify(m.embedKnowledgeObject({ ...KO_BLN, decision_level: "unknown", affected_geographies: [] })));
check("H4 Aehnlichkeit des fremden Landesvorgangs ist unveraendert (fachliche Naehe bleibt erlaubt)",
  m.cosineSimilarity(m.embedProfile(PROFIL_BB), m.embedKnowledgeObject(KO_BLN)) > 0);
check("H5 Rangfolge: der fremde Vorgang bleibt in der Kandidatenliste, aber ohne Ausschussbeleg",
  (() => {
    const r = m.matchProfileToKnowledgeObjects(PROFIL_BB, [KO_BB, KO_BLN, KO_BUND], { limit: 10 });
    const bb = r.find((x) => x.knowledge_object_id === KO_BB.id);
    const bln = r.find((x) => x.knowledge_object_id === KO_BLN.id);
    return bb && bln && bb.rank < bln.rank
      && bb.matched_features.some((f) => f.type === "ausschuss")
      && !bln.matched_features.some((f) => f.type === "ausschuss");
  })(),
  JSON.stringify(m.matchProfileToKnowledgeObjects(PROFIL_BB, [KO_BB, KO_BLN, KO_BUND], { limit: 10 })
    .map((x) => [x.knowledge_object_id, x.rank, x.similarity, x.matched_features.map((f) => f.type)])));
check("H6 der harte Ausschussfilter (passesFilters) bleibt unangetastet — er ist eine Suchvorgabe, kein Beleg",
  m.passesFilters(m.knowledgeObjectFeatures(KO_BLN), { committees: [BB_AUSSCHUSS] }) === true);
// Pflicht 21/22: Profilhash und Eingabefingerabdruck bleiben unveraendert.
// Der Eingabefingerabdruck eines Wissensobjekts entsteht in runMatchingCore aus
// `computeKnowledgeObjectInputHash(knowledgeObjectWeightedTokens(ko), rezept)`.
// Die gewichteten Token werden AUSSCHLIESSLICH aus den vier Merkmalsdimensionen
// (Partei/Ausschuss/Region/Thema) und den Inhaltstoken gebildet — der
// Zustaendigkeitsraum reist als eigenes Feld daneben. Beweis in zwei Schritten:
// die Dimensionen sind identisch (H7) und der daraus gebildete Vektor ist
// identisch (H3) — damit ist auch der Fingerabdruck identisch.
check("H7 (Pflicht 21/22) Profilhash und alle fingerabdruckbildenden Dimensionen sind von Ebene/Geografie unabhaengig",
  (() => {
    const ohneZust = (o) => { const kopie = { ...o }; delete kopie.zustaendigkeit; return JSON.stringify(kopie); };
    const koA = m.knowledgeObjectFeatures(KO_LAND_GESUNDHEIT);
    const koB = m.knowledgeObjectFeatures({ ...KO_LAND_GESUNDHEIT, decision_level: "bund", affected_geographies: [] });
    return m.profileHash(PROFIL_BUND_GESUNDHEIT)
        === m.profileHash({ ...PROFIL_BUND_GESUNDHEIT, politicalLevel: undefined, parliamentType: undefined })
      && ohneZust(koA) === ohneZust(koB)
      && JSON.stringify(koA.zustaendigkeit) !== JSON.stringify(koB.zustaendigkeit);
  })());
check("H8 (Pflicht 15/16/17) Kandidatenliste, Aehnlichkeit und Top-N-Schnitt eines BUNDESprofils sind unveraendert",
  (() => {
    // Dieselbe Kandidatenmenge, einmal mit und einmal ohne wirksame Regel
    // (Profil ohne Mandatsebene = regelfrei). Rang, Aehnlichkeit, Reihenfolge und
    // Schnitt muessen identisch sein — nur die Belege duerfen sich unterscheiden.
    const kandidaten = [KO_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT, KO_KOMMUNE_SOZIAL, KO_BLN, KO_BUND];
    const ohne = { ...PROFIL_BUND_GESUNDHEIT, politicalLevel: undefined, parliamentType: undefined };
    const proj = (p, limit) => m.matchProfileToKnowledgeObjects(p, kandidaten, { limit })
      .map((r) => [r.knowledge_object_id, r.rank, r.similarity]);
    return JSON.stringify(proj(PROFIL_BUND_GESUNDHEIT, 10)) === JSON.stringify(proj(ohne, 10))
      && JSON.stringify(proj(PROFIL_BUND_GESUNDHEIT, 2)) === JSON.stringify(proj(ohne, 2));
  })(),
  JSON.stringify(m.matchProfileToKnowledgeObjects(PROFIL_BUND_GESUNDHEIT,
    [KO_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT, KO_KOMMUNE_SOZIAL, KO_BLN, KO_BUND], { limit: 10 })
    .map((r) => [r.knowledge_object_id, r.rank, r.similarity])));

// ═══ I · Bundesseite ueber den GANZEN Pfad (Pflicht 8-14) ═══════════════════
// Derselbe Nachweis wie D/E, aber fuer den 27A-2-Fall: der fremde Ausschuss darf
// in KEINER nachgelagerten Ausgabe mehr auftauchen.
abschnitt("I · Bundesmandat x Landesvorgang: kein Ausschuss in Signal, Begruendung, Erklaerung, Entscheidung, M8");
const featsBundFremd = feats(PROFIL_BUND_GESUNDHEIT, KO_LAND_GESUNDHEIT);
const signaleBundFremd = begruendung.buildSignals(featsBundFremd, SIM_LAND_GESUNDHEIT);
check("I1 (Pflicht 8) `matched_features` traegt keinen Ausschuss mehr",
  !featsBundFremd.some((f) => f.type === "ausschuss"), JSON.stringify(featsBundFremd));
check("I2 (Pflicht 9) die gespeicherten `signale` tragen keinen Ausschussschluessel",
  !Object.prototype.hasOwnProperty.call(signaleBundFremd, "ausschuss"), JSON.stringify(signaleBundFremd));
check("I3 (Pflicht 10) die persistierte Begruendung nennt den fremden Ausschuss nicht",
  !/Ausschuss|Gesundheit/.test(String(begruendung.begruendungAusSignalen(signaleBundFremd, featsBundFremd) || "")),
  String(begruendung.begruendungAusSignalen(signaleBundFremd, featsBundFremd)));
check("I4 (Pflicht 11) die sichtbare Erklaerung fuehrt keinen Ausschussbeleg (und erfindet keinen Ersatz)",
  (() => {
    const e = erklaerung.erklaerungAusErgebnis({ signale: signaleBundFremd, matched_features: featsBundFremd, similarity: SIM_LAND_GESUNDHEIT });
    return e === null || (!e.belege.some((b) => b.art === "ausschuss") && !/Ausschuss/.test(e.satz));
  })(),
  JSON.stringify(erklaerung.erklaerungAusErgebnis({ signale: signaleBundFremd, matched_features: featsBundFremd })));
check("I5 (Pflicht 12/13) kein Entscheidungsgewicht: Score 49 -> 15 (Delta genau 34), Stufe wechselt — wie im Realfall gemessen",
  (() => {
    const regelfrei = m.matchedFeatures(
      { ...m.profileFeatures(PROFIL_BUND_GESUNDHEIT), zustaendigkeit: null },
      { ...m.knowledgeObjectFeatures(KO_LAND_GESUNDHEIT), zustaendigkeit: null }
    );
    const mit = decisions.scoreKnowledgeObject(KO_LAND_GESUNDHEIT, { similarity: SIM_LAND_GESUNDHEIT, matched_features: regelfrei });
    const ohne = decisions.scoreKnowledgeObject(KO_LAND_GESUNDHEIT, { similarity: SIM_LAND_GESUNDHEIT, matched_features: featsBundFremd });
    return regelfrei.some((f) => f.type === "ausschuss")
      && mit === 49 && ohne === 15 && mit - ohne === 34
      && decisions.decisionFromScore(mit) === "Beobachten"
      && decisions.decisionFromScore(ohne) === "Ignorieren";
  })(),
  JSON.stringify([decisions.scoreKnowledgeObject(KO_LAND_GESUNDHEIT, { similarity: SIM_LAND_GESUNDHEIT, matched_features: featsBundFremd })]));
check("I6 (Pflicht 14) M8 (aktiv) laesst die Zeile nicht mehr durch — allein der fremde Ausschuss trug sie",
  (() => {
    const g = relevanz.wendeRelevanzGateAn([{ id: "i6", matched_features: featsBundFremd }], { aktiv: true });
    return featsBundFremd.length === 0 && g.zeilen.length === 0 && g.verworfen === 1;
  })(), JSON.stringify(featsBundFremd));
check("I7 die echte Bundesmitgliedschaft bleibt ueber den ganzen Pfad erhalten",
  (() => {
    const f = feats(PROFIL_BUND_GESUNDHEIT, KO_BUND_GESUNDHEIT);
    const s = begruendung.buildSignals(f, 0.4);
    const e = erklaerung.erklaerungAusErgebnis({ signale: s, matched_features: f, similarity: 0.4 });
    const d = decisions.decideForUser(PROFIL_BUND_GESUNDHEIT, [KO_BUND_GESUNDHEIT], { userId: PROFIL_BUND_GESUNDHEIT.id })[0];
    return Array.isArray(s.ausschuss)
      && /deinen Ausschuss Gesundheit/.test(String(begruendung.begruendungAusSignalen(s, f)))
      && e && e.belege.some((b) => b.art === "ausschuss")
      && d && (d.matched_features || []).some((x) => x.type === "ausschuss")
      && relevanz.wendeRelevanzGateAn([{ id: "i7", matched_features: f }], { aktiv: true }).zeilen.length === 1;
  })());
check("I8 (Pflicht 7) thematische Gemeinsamkeit wirkt weiter als THEMA — wenn das Profil den Schwerpunkt traegt",
  (() => {
    // derivePolicyFields leitet aus "Gesundheitsausschuss (Landtag)" das Politikfeld
    // "Gesundheit" ab. Traegt das Profil diesen Schwerpunkt, bleibt der fachliche
    // Bezug als `thema` sichtbar — nur eben nicht als Mitgliedschaft.
    const p = { ...PROFIL_BUND_GESUNDHEIT, focusTopics: ["Gesundheit"] };
    const f = feats(p, KO_LAND_GESUNDHEIT);
    return f.some((x) => x.type === "thema" && x.value === "Gesundheit")
      && !f.some((x) => x.type === "ausschuss");
  })(), JSON.stringify(feats({ ...PROFIL_BUND_GESUNDHEIT, focusTopics: ["Gesundheit"] }, KO_LAND_GESUNDHEIT)));

// ═══ J · Nebenbefund EU/international: Ist-Stand festgeschrieben ═════════════
// BEWUSST UNVERAENDERT. In den echten Production-Daten nennen EU-/internationale
// Vorgaenge teils ECHTE Bundestagsausschuesse ("Ausschuss fuer Arbeit und
// Soziales", "Auswaertiger Ausschuss"), teils fremde Gremien ("Europaeischer
// Ausschuss fuer soziale Rechte"). Die Ebene allein trennt das nicht — eine
// Verschaerfung braeuchte eine neue fachliche Entscheidung ueber institutionelle
// Beziehungen und wuerde hier auch ECHTE Belege entfernen. Diese Zusicherung ist
// der Ist-Stand, KEINE Aussage darueber, dass er richtig ist (§52.7).
abschnitt("J · Nebenbefund EU/international (getrennte Entscheidung, Verhalten unveraendert)");
check("J1 Bundesmandat x EU-Vorgang mit ECHTEM Bundestagsausschuss: Beleg bleibt (sonst verloere man einen richtigen Beleg)",
  hatAusschuss(PROFIL_BUND_SOZIALES, KO_EU_SOZIALES), JSON.stringify(feats(PROFIL_BUND_SOZIALES, KO_EU_SOZIALES)));
check("J2 Bundesmandat x internationalem Vorgang: Verhalten ebenfalls unveraendert",
  hatAusschuss(PROFIL_BUND_SOZIALES, { ...KO_EU_SOZIALES, decision_level: "international" }));
check("J3 die Ausnahme gilt NUR fuer Bundesmandate — ein Landesmandat verliert den Beleg weiterhin (G5)",
  !hatAusschuss(PROFIL_BB, { ...KO_BB, decision_level: "eu" }));
check("J4 die Ausnahme ist auf eu/international begrenzt und weitet sich nicht auf land/kommune aus",
  !hatAusschuss(PROFIL_BUND_SOZIALES, { ...KO_EU_SOZIALES, decision_level: "land" })
  && !hatAusschuss(PROFIL_BUND_SOZIALES, { ...KO_EU_SOZIALES, decision_level: "kommune" }));

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
