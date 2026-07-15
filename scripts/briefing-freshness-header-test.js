"use strict";

// Pilot-Readiness-Fix (2026-07, Teil 2): EINE gemeinsame Wahrheit für die Aktualität.
// FRÜHERER FEHLER:
//   decorateBriefingFreshness (server.js) leitete den Kopf-Status aus
//   isBriefingStaleForBerlin(briefing.generatedAt) ab. generatedAt wird im
//   V3-Read-Pfad bei JEDEM Request auf now gesetzt -> der Guard meldete nie stale
//   -> der Kopf zeigte immer "Aktuell", während die Karte (currentHelmutState.status
//   aus den ECHTEN Datenzeitstempeln) korrekt "Nicht aktuell" meldete. Widerspruch,
//   und ein fehlgeschlagener Nachtlauf konnte "Aktuell" ergeben.
// FIX: decorateBriefingFreshness leitet die Frische aus briefing.currentHelmutState
//   ab (staleState/status/errorState). Alter/fehlgeschlagener Stand -> "Veraltet"
//   (ruhig, kein Fehlerdialog), nur echt frischer Stand -> "Aktuell". Ohne State
//   (Alt-Pfad) greift der bisherige generatedAt-Guard weiter (rückwärtsverträglich).
// KEIN Netz, KEINE KI.

const contract = require("../lib/helmut/briefingContract");
const server = require("../server.js");
const decorate = server.__decorateBriefingFreshness;

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

check("Test-Hook vorhanden: server.__decorateBriefingFreshness", typeof decorate === "function");

const NOW = new Date("2026-07-15T09:00:00Z"); // Europe/Berlin 11:00, 15. Juli
const profile = { id: "u-1", tenantId: "t-1", firstName: "Test", party: "SPD", committee: "Gesundheit", focusTopics: ["Pflege"] };

function fullKo(id, vg, updatedAt, extra = {}) {
  return {
    id, vorgang_id: vg, status: "neu", understanding_status: "complete",
    display_title: "Bundesregierung legt Pflegereform vor", was_ist_passiert: "Reform vorgestellt.",
    warum_wichtig: "Millionen betroffen.", why_relevant: "Betrifft deinen Ausschuss.", recommendation: "Heute nicht zuspitzen.",
    risk_of_no_action: "Uneinheitliche Kommunikation.", opportunity_summary: "Soziale Entlastung besetzen.",
    risk_level: "high", opportunity_level: "high",
    recommended_communication_struct: { communicationLine: "Wir beobachten genau.", recommendedChannel: "press", recommendedFormat: "pressRelease", suggestedOutputs: ["statement"] },
    action_items_struct: [{ title: "Linie abstimmen", description: "", dueHint: "heute", priority: "high", actionType: "alignInternally" }],
    ausschuesse: ["Gesundheit"], parteien: ["SPD"], tags: ["Reform"], zeitdruck: "hoch",
    confidence_score: 85, source_document_count: 8, updated_at: updatedAt, created_at: updatedAt, ...extra
  };
}
function decisionFor(id, vg, score = 88) {
  return { knowledge_object_id: id, vorgang_id: vg, score, decision: "Sofort reagieren", priority_type: "risk", risk: "r", chance: "", matched_features: [{ type: "ausschuss", value: "Gesundheit" }] };
}
function stateFor(ko) {
  return contract.buildCurrentHelmutState({
    profile, decisions: [decisionFor(ko.id, ko.vorgang_id)], kosById: { [ko.id]: ko }, sourcesByVorgang: {}, now: NOW
  });
}
// Kopf-Frische liest currentHelmutState + items/situational; generatedAt=now (V3-Realität).
function briefingWith(state, { items, situational = [] } = {}) {
  return {
    engine: "v3",
    status: "Aktuell", // roher Vertragswert (items>0) — der Decorator MUSS ihn ggf. herabstufen
    generatedAt: new Date().toISOString(), // absichtlich "jetzt" — der alte Guard sähe das nie als stale
    items: items || [{ decision: "Sofort reagieren", id: state.primaryVorgangId || "vg-1" }],
    situationalBriefing: situational,
    currentHelmutState: state
  };
}

// Kartenlabel (Referenz aus client.js HSTAND_STATUS_LABEL) — zur Nicht-Widerspruchs-Prüfung.
const CARD_LABEL = { fresh: "Aktuell", stale: "Nicht aktuell", error: "Stand nicht verfügbar", empty: "Kein aktueller Stand" };

// === 1) FRISCH: heutiger Datenstand -> Karte fresh, Kopf "Aktuell" ===========
const freshState = stateFor(fullKo("ko-f", "vg-f", "2026-07-15T07:00:00Z"));
check("Vorbedingung: frischer Stand -> currentHelmutState.status 'fresh'", freshState.status === "fresh", freshState.status);
check("FRISCH: Kopf zeigt 'Aktuell'", decorate(briefingWith(freshState)).status === "Aktuell");

// === 2) VERALTET: gestriger Datenstand -> Karte stale, Kopf NIE "Aktuell" =====
const staleState = stateFor(fullKo("ko-s", "vg-s", "2026-06-20T07:00:00Z"));
check("Vorbedingung: alter Stand -> currentHelmutState.status 'stale' + staleState",
  staleState.status === "stale" && staleState.staleState === true, staleState.status);
{
  const dec = decorate(briefingWith(staleState));
  check("VERALTET: Kopf zeigt 'Veraltet' (NICHT 'Aktuell')", dec.status === "Veraltet", dec.status);
  check("VERALTET: Nicht-Widerspruch — Kopf UND Karte sind beide nicht 'Aktuell'",
    dec.status !== "Aktuell" && CARD_LABEL[staleState.status] !== "Aktuell");
  check("VERALTET: freshness.isStale = true (konsistent)", dec.freshness && dec.freshness.isStale === true);
}

// === 3) FEHLGESCHLAGENER NACHTLAUF (understanding failed) -> nie "Aktuell" ====
const errorState = stateFor(fullKo("ko-e", "vg-e", "2026-07-15T07:00:00Z", { understanding_status: "failed" }));
check("Vorbedingung: understanding failed -> currentHelmutState.status 'error'/errorState",
  errorState.status === "error" && errorState.errorState === true, errorState.status);
check("FEHLLAUF: Kopf zeigt NIEMALS 'Aktuell' (ruhig 'Veraltet')",
  decorate(briefingWith(errorState)).status === "Veraltet");

// === 4) KEIN BRIEFING / leerer Stand -> keine positive 'Aktuell'-Meldung ======
const emptyState = contract.buildCurrentHelmutState({ profile, decisions: [], kosById: {}, sourcesByVorgang: {}, now: NOW });
check("Vorbedingung: leerer Stand -> currentHelmutState.status 'empty'", emptyState.status === "empty");
{
  const dec = decorate(briefingWith(emptyState, { items: [] }));
  check("LEER: Kopf zeigt keine 'Aktuell'-Meldung", dec.status !== "Aktuell", dec.status);
}

// === 5) Alter Inhalt bleibt lesbar: der Decorator LÖSCHT keine Items ==========
{
  const b = briefingWith(staleState);
  const dec = decorate(b);
  check("Alter Inhalt bleibt erhalten: items unverändert durchgereicht (keine dramatische Leerung)",
    Array.isArray(dec.items) && dec.items.length === b.items.length);
}

// === 6) Rückwärtsverträglich: OHNE currentHelmutState -> generatedAt-Guard =====
{
  const staleOld = { status: "Aktuell", generatedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    items: [{ decision: "Sofort reagieren" }], situationalBriefing: [] };
  check("Alt-Pfad: 3 Tage alt, kein State -> Fallback-Guard ergibt 'Veraltet'",
    decorate(staleOld).status === "Veraltet");
  const freshOld = { status: "Aktuell", generatedAt: new Date().toISOString(),
    items: [{ decision: "Sofort reagieren" }], situationalBriefing: [] };
  check("Alt-Pfad: frisch (jetzt) + Items, kein State -> 'Aktuell' (unverändertes Altverhalten)",
    decorate(freshOld).status === "Aktuell");
}

// === 7) Demo-/Vorschau-Sonderfall bleibt unangetastet ========================
check("Demo-Status bleibt unverändert (kein Eingriff)", decorate({ status: "Demo" }).status === "Demo");

console.log(`\n${passed}/${passed + failed} Briefing-Frische-Kopf-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
