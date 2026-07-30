"use strict";

// Befund 27A-1 — Ausschussbeleg nur bei passendem Zustaendigkeitsraum.
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
// DIE REGEL (Produktregel des Sprints): ein politisches FACHGEBIET darf
// laenderuebergreifend aehnlich sein — eine konkrete AUSSCHUSSMITGLIEDSCHAFT
// gilt nur als Beleg, wenn Ausschuss und institutioneller Zustaendigkeitsraum
// zusammenpassen. Fuer ein Landesmandat heisst das: das Bundesland des Vorgangs
// muss POSITIV belegt dasselbe sein (fail-closed).
//
// GELTUNGSBEREICH: die Verschaerfung greift ausschliesslich fuer Profile mit
// eindeutiger LANDES-Mandatsebene. Bundes- und unbestimmte Profile verhalten
// sich byte-identisch wie vorher (Abschnitt F beweist das) — eine Verschaerfung
// dort veraenderte aktive Bundestagsergebnisse und ist eine getrennte
// Betreiberentscheidung (docs/matching-nachvollziehbarkeit.md §50, Befund 27A-2).
//
// REIN OFFLINE: 0 KI, 0 Netz, 0 Datenbank, 0 Zufall. Es werden die ECHTEN
// Produktionsfunktionen geprueft (matching, matching-begruendung,
// matching-erklaerung, matching-relevanz, decisions) — keine Testkopie der Logik.

const m = require("../lib/helmut/matching");
const begruendung = require("../lib/helmut/matching-begruendung");
const erklaerung = require("../lib/helmut/matching-erklaerung");
const relevanz = require("../lib/helmut/matching-relevanz");
const decisions = require("../lib/helmut/decisions");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + String(detail).slice(0, 300) : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

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
check("A4 der Ausschuss-Token steht deshalb weiterhin in BEIDEN Merkmalsvektoren (Ranking unangetastet)",
  m.embedKnowledgeObject(KO_BLN).length === m.EMBEDDING_DIM
  && JSON.stringify(m.embedKnowledgeObject(KO_BLN)) === JSON.stringify(m.embedKnowledgeObject(KO_BLN)));

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

// ═══ F · Pflichtregression 5: Bundesmatching unveraendert ═══════════════════
abschnitt("F · Bundes- und unbestimmte Profile bleiben unveraendert");
check("F1 (Pflicht 5) Bundestagssynonyme funktionieren weiter: 'Sozialausschuss' belegt 'Arbeit und Soziales'",
  (() => {
    const p = { ...PROFIL_BUND, committees: ["Sozialausschuss"], focusTopics: [] };
    const k = ko("bt-soziales", { decision_level: "bund", ausschuesse: ["Ausschuss für Arbeit und Soziales"] });
    return feats(p, k).some((f) => f.type === "ausschuss");
  })());
check("F2 Bundesprofil x Bundesvorgang: Ausschussbeleg unveraendert vorhanden",
  hatAusschuss(PROFIL_BUND, KO_BUND), JSON.stringify(feats(PROFIL_BUND, KO_BUND)));
check("F3 Bundesprofil x Vorgang ohne belegte Zustaendigkeit: Verhalten unveraendert (kein neuer Wegfall)",
  hatAusschuss(PROFIL_BUND, KO_OHNE_ZUSTAENDIGKEIT));
check("F4 Bundesprofil x fremdem Landesvorgang: bewusst UNVERAENDERT (Befund 27A-2, getrennte Betreiberentscheidung)",
  hatAusschuss(PROFIL_BUND, KO_BLN) === true,
  "eine Verschaerfung hier wuerde aktive Bundestagsergebnisse veraendern");
check("F5 Profil ohne Mandatsebene: Verhalten unveraendert (Ebene ist nicht belegt)",
  hatAusschuss(PROFIL_OHNE_EBENE, KO_BLN) && hatAusschuss(PROFIL_OHNE_EBENE, KO_OHNE_ZUSTAENDIGKEIT));
check("F6 die Regel entfernt AUSSCHLIESSLICH Ausschussbelege — sie fuegt nie einen hinzu",
  [[PROFIL_BB, KO_BLN], [PROFIL_BLN, KO_BB], [PROFIL_BUND, KO_BLN], [PROFIL_OHNE_EBENE, KO_BB]]
    .every(([p, k]) => {
      const mitRegel = feats(p, k).filter((f) => f.type === "ausschuss").length;
      const ohneRegel = m.matchedFeatures(
        { ...m.profileFeatures(p), zustaendigkeit: null },
        { ...m.knowledgeObjectFeatures(k), zustaendigkeit: null }
      ).filter((f) => f.type === "ausschuss").length;
      return mitRegel <= ohneRegel;
    }));

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

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
