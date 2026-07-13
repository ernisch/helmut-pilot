"use strict";

// Integrationstest: flag-gesicherte Verdrahtung des Sprint-5-Scorings in die drei
// Read-Pfade (Lage/Radar/Helmut). Beweist:
//   - Flag AUS (Default) => Alt-Verhalten unveraendert, KEIN emptyState-Feld.
//   - Flag AN            => Lage rankt nach Wichtigkeit, Helmut nach Handlungsfaehigkeit,
//                          alle drei liefern einen unterscheidbaren Leerzustand (gap/stale/quiet).
// Reine Offline-Tests: radarState/briefingContract sind pur; Lage ueber die injizierbare
// loadRankedVorgaenge (Stub-Storage, kein Netz/KI).

const lage = require("../lib/helmut/lage");
const radarState = require("../lib/helmut/radarState");
const briefingContract = require("../lib/helmut/briefingContract");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}
function withFlag(mode, fn) {
  const prev = process.env.HELMUT_SCORING_MODE;
  if (mode == null) delete process.env.HELMUT_SCORING_MODE; else process.env.HELMUT_SCORING_MODE = mode;
  try { return fn(); } finally {
    if (prev == null) delete process.env.HELMUT_SCORING_MODE; else process.env.HELMUT_SCORING_MODE = prev;
  }
}

const NOW = new Date("2026-07-13T12:00:00Z");
const iso = (agoMs) => new Date(NOW.getTime() - agoMs).toISOString();
const H = 3600000, D = 24 * H;

// ============================ LAGE ============================
console.log("== LAGE: Wichtigkeit statt persoenlicher Filterblase (flag-gesichert) ==");
// KO 'a' = kommunale Randnotiz (persoenlich zuerst gematcht), KO 'b' = Bundesgesetz (global wichtig).
const koA = { id: "a", vorgang_id: "a", status: "neu", understanding_status: "complete", was_ist_passiert: "Randnotiz", decision_level: "kommune", event_type: "sonstiges", source_document_count: 1, updated_at: iso(3 * H) };
const koB = { id: "b", vorgang_id: "b", status: "neu", understanding_status: "complete", was_ist_passiert: "Bundesgesetz", decision_level: "bund", event_type: "gesetzentwurf", source_document_count: 6, risk_level: "high", zeitdruck: "hoch", ministerien: ["BMAS"], parteien: ["SPD"], updated_at: iso(3 * H) };
const stubStorage = {
  listKnowledgeObjects: async () => [koA, koB],
  // gespeicherte personalisierte Matches: 'a' zuerst (persoenlich naeher)
  listMatchingResults: async () => [{ knowledge_object_id: "a" }, { knowledge_object_id: "b" }]
};
const profile = { id: "u1", fullName: "Test MdB", party: "SPD" };

// Env muss ueber das await hinweg gesetzt bleiben (scoringActive() wird NACH dem
// listKnowledgeObjects-await geprueft) -> Env innerhalb des await halten.
async function rankWith(mode) {
  const prev = process.env.HELMUT_SCORING_MODE;
  if (mode == null) delete process.env.HELMUT_SCORING_MODE; else process.env.HELMUT_SCORING_MODE = mode;
  try { return await lage.loadRankedVorgaenge(stubStorage, null, profile, "u1"); }
  finally { if (prev == null) delete process.env.HELMUT_SCORING_MODE; else process.env.HELMUT_SCORING_MODE = prev; }
}
(async () => {
  const off = await rankWith(undefined), on = await rankWith("on");
  check("Lage Flag AUS: persoenliche Reihenfolge (a zuerst)", off[0].id === "a");
  check("Lage Flag AN: wichtigster zuerst (b = Bundesgesetz)", on[0].id === "b");
  check("Lage Flag AN: kommunale Randnotiz rutscht nach hinten", on[on.length - 1].id === "a");

  // ============================ RADAR ============================
  console.log("== RADAR: unterscheidbarer Leerzustand (flag-gesichert) ==");
  const radarProfile = { id: "u1", fullName: "Test Person", party: "SPD" };
  // kein Umfeldbezug -> Radar leer. Verschiedene Frische-Lagen:
  const freshUnrelated = { id: "r1", vorgang_id: "r1", status: "neu", understanding_status: "complete", was_ist_passiert: "Fremdthema", updated_at: iso(2 * H), sources: [{ published_at: iso(2 * H) }] };
  const staleUnrelated = { id: "r2", vorgang_id: "r2", status: "neu", understanding_status: "complete", was_ist_passiert: "Altes Fremdthema", updated_at: iso(9 * D), sources: [{ published_at: iso(9 * D) }] };

  const radOffFresh = withFlag(undefined, () => radarState.buildCurrentRadarState({ profile: radarProfile, decisions: [], knowledgeObjects: [freshUnrelated], now: NOW }));
  check("Radar Flag AUS: KEIN emptyState-Feld (rueckwaertskompatibel)", radOffFresh.status === "empty" && radOffFresh.emptyState === undefined);

  const radOnGap = withFlag("on", () => radarState.buildCurrentRadarState({ profile: radarProfile, decisions: [], knowledgeObjects: [], now: NOW }));
  check("Radar Flag AN, keine Daten: emptyState.kind=gap", radOnGap.emptyState && radOnGap.emptyState.kind === "gap");

  const radOnQuiet = withFlag("on", () => radarState.buildCurrentRadarState({ profile: radarProfile, decisions: [], knowledgeObjects: [freshUnrelated], now: NOW }));
  check("Radar Flag AN, frisch aber kein Umfeld: kind=quiet reason kein-umfeldsignal", radOnQuiet.emptyState && radOnQuiet.emptyState.kind === "quiet" && radOnQuiet.emptyState.reason === "kein-umfeldsignal");

  const radOnStale = withFlag("on", () => radarState.buildCurrentRadarState({ profile: radarProfile, decisions: [], knowledgeObjects: [staleUnrelated], now: NOW }));
  check("Radar Flag AN, veraltet: kind=stale (nicht quiet!)", radOnStale.emptyState && radOnStale.emptyState.kind === "stale");

  // ============================ HELMUT ============================
  console.log("== HELMUT: Handlungsfaehigkeit + Leerzustand (flag-gesichert) ==");
  // Zwei gleich-priorisierte Entscheidungen; nur Handlungsfaehigkeit unterscheidet.
  // id 'aaa' (kein Handlungssignal) sortiert per Alt-Tiebreak VOR 'zzz' (konkret handelbar).
  const koLowAct = { id: "aaa", vorgang_id: "aaa", was_ist_passiert: "x", warum_wichtig: "y", handlungsempfehlung: "—", updated_at: iso(1 * H) };
  const koHighAct = { id: "zzz", vorgang_id: "zzz", was_ist_passiert: "x", warum_wichtig: "y", zeitdruck: "hoch", handlungsempfehlung: "Jetzt Statement", action_items_struct: [{ title: "Statement", actionType: "prepareStatement", dueHint: "heute" }], recommended_communication_struct: { recommendedChannel: "press", recommendedFormat: "statement", suggestedOutputs: ["PM"] }, updated_at: iso(1 * H) };
  const kosById = { aaa: koLowAct, zzz: koHighAct };
  const decisions = [
    { knowledge_object_id: "aaa", vorgang_id: "aaa", decision: "Sofort reagieren", score: 90, matched_features: [] },
    { knowledge_object_id: "zzz", vorgang_id: "zzz", decision: "Sofort reagieren", score: 90, matched_features: [] }
  ];
  const helmProfile = { id: "u1", fullName: "Test MdB", party: "SPD" };

  const helmOff = withFlag(undefined, () => briefingContract.buildCurrentHelmutState({ profile: helmProfile, decisions, kosById, sourcesByVorgang: {}, now: NOW }));
  const helmOn = withFlag("on", () => briefingContract.buildCurrentHelmutState({ profile: helmProfile, decisions, kosById, sourcesByVorgang: {}, now: NOW }));
  check("Helmut Flag AUS: Alt-Tiebreak waehlt 'aaa' als Primary", helmOff.primaryVorgangId === "aaa");
  check("Helmut Flag AN: handlungsfaehigster Vorgang 'zzz' wird Primary", helmOn.primaryVorgangId === "zzz");

  // Leerzustand Helmut
  const helmGap = withFlag("on", () => briefingContract.buildCurrentHelmutState({ profile: helmProfile, decisions: [], kosById: {}, sourcesByVorgang: {}, now: NOW }));
  check("Helmut Flag AN, keine Daten: emptyState.kind=gap", helmGap.emptyState && helmGap.emptyState.kind === "gap");
  const helmQuiet = withFlag("on", () => briefingContract.buildCurrentHelmutState({ profile: helmProfile, decisions: [], kosById: { zzz: { ...koHighAct, updated_at: iso(1 * H), sources: [{ published_at: iso(1 * H) }] } }, sourcesByVorgang: {}, now: NOW }));
  check("Helmut Flag AN, frisch aber keine Entscheidung: kind=quiet reason kein-handlungsbedarf", helmQuiet.emptyState && helmQuiet.emptyState.kind === "quiet" && helmQuiet.emptyState.reason === "kein-handlungsbedarf");
  const helmOffEmpty = withFlag(undefined, () => briefingContract.buildCurrentHelmutState({ profile: helmProfile, decisions: [], kosById: {}, sourcesByVorgang: {}, now: NOW }));
  check("Helmut Flag AUS, leer: KEIN emptyState-Feld (rueckwaertskompatibel)", helmOffEmpty.status === "empty" && helmOffEmpty.emptyState === undefined);

  // ============================ Drei Tabs, DREI reasons ============================
  console.log("== Drei Tabs liefern drei unterscheidbare quiet-reasons ==");
  const lageQuiet = require("../lib/helmut/scoring").tabEmptyState("lage", { kos: [freshUnrelated], hasRankedItems: false, now: NOW.getTime(), staleHours: 24 * 30 });
  check("drei unterscheidbare quiet-reasons (lage/radar/helmut)",
    new Set([lageQuiet.reason, radOnQuiet.emptyState.reason, helmQuiet.emptyState.reason]).size === 3);

  console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
  process.exit(fail > 0 ? 1 : 0);
})();
