"use strict";

// Helmut — RÜCKSTANDSSCHLEIFE des Verstehens (Kapazitätssprint 2026-08-31).
// =====================================================================================
// ANLASS (Production rein lesend vermessen, docs/betrieb/understanding-kapazitaet-2026-08-31.md):
// Die Auswahl wartender Vorgänge lief ausschließlich über `updated_at.desc` mit
// Fenster 50 — bei ~307 Neuankünften/Tag enthielt das Fenster strukturell nur die
// jüngsten Vorgänge. Belegte Folge: 9.080 wartende Vorgänge, davon 8.895 älter als
// 24 h (ältester 02.07.), während der Abfluss (Ø 68/Tag) fast ausschließlich
// Vorgänge unter 24 h bediente (Vorgänge älter als 7 Tage: 1–5/Tag). Gleichzeitig
// blieben im Schnitt ~19 Aufrufe des KI-Tagesdeckels ungenutzt (Deckel 100 nur an
// 4 von 47 Tagen erreicht).
//
// DIE KORREKTUR: eigene, zeitversetzte Rückstandsläufe (/api/cron/understanding-
// rueckstand), die denselben unveränderten Verstehensmotor fahren — gleiche
// CAS-Reservierung, gleiches Fencing, gleiche Restzeitwache, gleiche Laufbilanz
// (PR #283) — aber (a) die ÄLTESTEN wartenden Vorgänge zuerst wählen und (b) ihre
// Modellaufrufe NICHT priorisiert buchen (callType ≠ 'understanding' ⇒
// effectiveMax = Tagesdeckel − Verstehens-Reserve). Damit kann ein Rückstandslauf
// weder den Tagesdeckel überschreiten noch der Frischverarbeitung (priorisiert,
// bis Tagesdeckel) ihre dokumentierte Reserve wegnehmen.
//
// DREI GRENZEN, ALLE FAIL-CLOSED:
//   1. Laufdeckel   — höchstens N neue Modellaufrufe je Rückstandslauf
//                     (HELMUT_RUECKSTAND_MAX_AUFRUFE, Default 20, geklemmt 1–50).
//   2. Budget-Boden — keine neue Erlaubnis, wenn vom Tagesdeckel weniger als
//                     `Boden` Aufrufe übrig sind (HELMUT_RUECKSTAND_BUDGET_BODEN,
//                     Default 30 = dokumentierte Verstehens-Reserve; geklemmt 0–500).
//                     Der Boden ist eine zusätzliche VORSICHT über der atomaren
//                     Buchung — die harte Garantie bleibt die nicht priorisierte
//                     Reservierung am Choke-Point (helmut_reserve_llm_call).
//   3. Zeit         — unverändert die Restzeitwache (§29) und die 280-s-Deadline
//                     des Aufrufers; dieses Modul fügt keine eigene Zeitlogik hinzu.
//
// Ein NICHT bestimmbarer Budgetstand erlaubt NICHTS (Rückstandsabbau ist immer
// aufschiebbar — im Zweifel wird vertagt, nie optimistisch gearbeitet). Das ist
// bewusst strenger als der Frischpfad (dort gilt HELMUT_LLM_BUDGET_FAIL_CLOSED).

const FENSTER_DEFAULT = 120;   // Auswahlfenster (älteste zuerst); > Laufdeckel, damit
const FENSTER_MIN = 10;        // beleglose Altvorgänge (skipped-no-cluster, kein
const FENSTER_MAX = 500;       // KI-Aufruf) das Fenster nicht leerfressen.
const LAUF_DECKEL_DEFAULT = 20; // ~ physische Slotleistung (220 s / ~11,5 s je Aufruf)
const LAUF_DECKEL_MIN = 1;
const LAUF_DECKEL_MAX = 50;
const BUDGET_BODEN_DEFAULT = 30; // = dokumentierte Verstehens-Reserve (100/30)
const BUDGET_BODEN_MIN = 0;
const BUDGET_BODEN_MAX = 500;

// Der nicht priorisierte Aufruftyp der Rückstandsläufe. NICHT in
// LLM_PRIORITY_CALLTYPES (storage.js) aufnehmen — genau daraus folgt die
// Deckelgarantie (effectiveMax = limit − reserve am atomaren Choke-Point).
const RUECKSTAND_CALLTYPE = "understanding-rueckstand";

function geklemmt(rohwert, fallback, min, max) {
  const n = Number(rohwert);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function rueckstandFenster(env = process.env) {
  const roh = String((env && env.HELMUT_RUECKSTAND_FENSTER) ?? "").trim();
  if (roh === "") return FENSTER_DEFAULT;
  return geklemmt(roh, FENSTER_DEFAULT, FENSTER_MIN, FENSTER_MAX);
}

function rueckstandLaufDeckel(env = process.env) {
  const roh = String((env && env.HELMUT_RUECKSTAND_MAX_AUFRUFE) ?? "").trim();
  if (roh === "") return LAUF_DECKEL_DEFAULT;
  return geklemmt(roh, LAUF_DECKEL_DEFAULT, LAUF_DECKEL_MIN, LAUF_DECKEL_MAX);
}

function rueckstandBudgetBoden(env = process.env) {
  const roh = String((env && env.HELMUT_RUECKSTAND_BUDGET_BODEN) ?? "").trim();
  if (roh === "") return BUDGET_BODEN_DEFAULT;
  return geklemmt(roh, BUDGET_BODEN_DEFAULT, BUDGET_BODEN_MIN, BUDGET_BODEN_MAX);
}

// Budget-Wächter eines EINZELNEN Rückstandslaufs. Kapselt die Vorprüfung
// (deps.canSpend des Verstehensmotors) mit Laufdeckel und Budget-Boden.
// `canSpendGlobal` ist storage.canSpendLlm(null) (wirft nie, liefert
// { allowed, used, limit, remaining, reason }).
//
// WICHTIG: Der Wächter zählt ERLAUBNISSE (Obergrenze der Modellaufrufe dieses
// Laufs) — nicht bestätigte Aufrufe. Das ist bewusst konservativ: eine erteilte,
// dann doch nicht genutzte Erlaubnis verkleinert nur den eigenen Lauf, nie den
// Tagesdeckel. Die tatsächliche Buchung bleibt allein die atomare Reservierung
// am Choke-Point (ai.js → reserveLlmCall, nicht priorisiert).
function baueRueckstandsWaechter({ canSpendGlobal, laufDeckel, budgetBoden } = {}) {
  if (typeof canSpendGlobal !== "function") {
    throw new Error("baueRueckstandsWaechter: canSpendGlobal (Funktion) ist Pflicht");
  }
  const deckel = Number.isFinite(Number(laufDeckel)) && Number(laufDeckel) >= 1
    ? Math.floor(Number(laufDeckel))
    : rueckstandLaufDeckel();
  const boden = Number.isFinite(Number(budgetBoden)) && Number(budgetBoden) >= 0
    ? Math.floor(Number(budgetBoden))
    : rueckstandBudgetBoden();
  let erlaubnisse = 0;

  const canSpend = async () => {
    if (erlaubnisse >= deckel) {
      return { allowed: false, reason: "rueckstand-laufdeckel-erreicht", laufDeckel: deckel };
    }
    let budget = null;
    try {
      budget = await canSpendGlobal();
    } catch (_) {
      budget = null; // canSpendLlm wirft nie — doppelt abgesichert bleibt: unklar = nein.
    }
    if (!budget || budget.allowed !== true) {
      return budget || { allowed: false, reason: "budget-nicht-bestimmbar" };
    }
    // FAIL CLOSED: ohne bezifferbaren Reststand keine neue Erlaubnis. Der
    // Frischpfad darf bei Störungen offen weiterarbeiten (Betreiberentscheidung
    // HELMUT_LLM_BUDGET_FAIL_CLOSED) — der Rückstandsabbau nie.
    // WICHTIG (dieselbe Falle wie PR #283, §6.1): Number(null) === 0 — ein
    // UNBEKANNTER Reststand würde sonst als „0 übrig" in den Boden-Zweig laufen
    // und dort einen falschen, aber plausibel klingenden Grund melden. Unbekannt
    // bleibt unbekannt.
    const rest = (budget.remaining === null || budget.remaining === undefined || budget.remaining === "")
      ? NaN
      : Number(budget.remaining);
    if (!Number.isFinite(rest)) {
      return {
        allowed: false, reason: "rueckstand-budget-unbekannt",
        used: budget.used ?? null, limit: budget.limit ?? null, remaining: null
      };
    }
    if (rest <= boden) {
      return {
        allowed: false, reason: "rueckstand-budget-boden-erreicht",
        used: budget.used ?? null, limit: budget.limit ?? null, remaining: rest, boden
      };
    }
    erlaubnisse += 1;
    return budget;
  };

  return {
    canSpend,
    erlaubnisse: () => erlaubnisse,
    laufDeckel: deckel,
    budgetBoden: boden
  };
}

// ── VORAB-BODENPRÜFUNG (Minimal-Cron-Vorbereitung, 500-Mandate-Reife 2026-09-01) ─────
// Ein budgetloser Rückstandslauf verbrannte bisher ~225 s Lesearbeit (Ladepfad je
// Kandidat VOR dem Budget-Check; belegt am Naturlauf 31.08. 17:30 UTC). Im
// vorbereiteten 48-Slot-Takt (`18,48 * * * *`) wären das bis zu ~3 h nutzlose
// Funktionszeit je Tag. Diese Prüfung stellt dieselbe Boden-Frage wie der Wächter
// EINMAL VOR jeder Lesearbeit — ohne eine Erlaubnis zu verbrauchen und ohne die
// Budgetsemantik zu ändern (die harte Garantie bleibt die atomare Reservierung).
// FAIL CLOSED wie der Wächter: ein nicht bezifferbarer Budgetstand erlaubt nichts.
async function vorabBodenPruefung({ canSpendGlobal, budgetBoden } = {}) {
  if (typeof canSpendGlobal !== "function") {
    return { erlaubt: false, grund: "vorab-kein-budgetleser" };
  }
  const boden = Number.isFinite(Number(budgetBoden)) && Number(budgetBoden) >= 0
    ? Math.floor(Number(budgetBoden))
    : rueckstandBudgetBoden();
  let budget = null;
  try { budget = await canSpendGlobal(); } catch (_) { budget = null; }
  if (!budget || budget.allowed !== true) {
    return { erlaubt: false, grund: (budget && budget.reason) || "budget-nicht-bestimmbar", used: (budget && budget.used) ?? null, limit: (budget && budget.limit) ?? null, remaining: null, boden };
  }
  const rest = (budget.remaining === null || budget.remaining === undefined || budget.remaining === "")
    ? NaN
    : Number(budget.remaining);
  if (!Number.isFinite(rest)) {
    return { erlaubt: false, grund: "rueckstand-budget-unbekannt", used: budget.used ?? null, limit: budget.limit ?? null, remaining: null, boden };
  }
  if (rest <= boden) {
    return { erlaubt: false, grund: "rueckstand-budget-boden-erreicht", used: budget.used ?? null, limit: budget.limit ?? null, remaining: rest, boden };
  }
  return { erlaubt: true, used: budget.used ?? null, limit: budget.limit ?? null, remaining: rest, boden };
}

// ── AUSFÜHRBARE KAPAZITÄTSRECHNUNG ───────────────────────────────────────────────────
// Dieselbe Rechnung, die der Kapazitätsbeleg dokumentiert — als Funktion, damit die
// Regressionssuite die Mengenaussagen des Belegs gegen die belegte Ankunft prüft,
// statt sie zu behaupten. Alle Eingaben sind Messwerte oder dokumentierte Grenzen;
// die Funktion erfindet keine Defaults für Preise oder Durchsatz.
//
// Modellannahmen (konservativ, im Beleg hergeleitet):
//   * Frischpfad bucht priorisiert (bis Tagesdeckel), Rückstandsläufe und die
//     übrigen Verbraucher nicht priorisiert (bis Tagesdeckel − Reserve).
//   * Chronologisch haben die übrigen Verbraucher Vorrang vor den Rückstandsläufen
//     (sie laufen morgens); die Rechnung nimmt ihnen daher nichts weg.
//   * Der Budget-Boden ist eine Laufzeit-Sicherung und geht bewusst NICHT als
//     zusätzliche Kapazität in die Planung ein.
function kapazitaetsRechnung({
  frischKiProTag,          // gemessene priorisierte Verstehensaufrufe/Tag (Slots + Queue + Lage)
  andereVerbraucherKiProTag, // gemessene nicht priorisierte Aufrufe/Tag
  slotsRueckstand,         // Anzahl Rückstandsläufe/Tag
  aufrufeJeSlot,           // physische Slotleistung (Zeitfenster / Modellzeit)
  laufDeckel,              // HELMUT_RUECKSTAND_MAX_AUFRUFE
  tagesdeckel,             // HELMUT_MAX_LLM_CALLS_PER_DAY
  reserveVerstehen,        // HELMUT_LLM_RESERVE_UNDERSTANDING
  aufrufeJeErgebnis        // gemessen: KI-Aufrufe je gespeichertem Ergebnis
} = {}) {
  const zahlen = { frischKiProTag, andereVerbraucherKiProTag, slotsRueckstand, aufrufeJeSlot, laufDeckel, tagesdeckel, reserveVerstehen, aufrufeJeErgebnis };
  for (const [name, wert] of Object.entries(zahlen)) {
    if (!Number.isFinite(Number(wert)) || Number(wert) < 0) {
      return { gueltig: false, grund: `eingabe-fehlt-oder-ungueltig:${name}` };
    }
  }
  const frisch = Number(frischKiProTag);
  const andere = Number(andereVerbraucherKiProTag);
  const deckel = Number(tagesdeckel);
  const reserve = Number(reserveVerstehen);
  const jeErgebnis = Number(aufrufeJeErgebnis);
  if (jeErgebnis <= 0) return { gueltig: false, grund: "eingabe-fehlt-oder-ungueltig:aufrufeJeErgebnis" };

  // Physische Obergrenze der Rückstandsläufe (Zeitfenster UND Laufdeckel).
  const physisch = Number(slotsRueckstand) * Math.min(Number(laufDeckel), Number(aufrufeJeSlot));
  // Nicht priorisierter Spielraum nach den übrigen Verbrauchern.
  const nichtPrioMax = Math.max(0, deckel - reserve);
  const nichtPrioFrei = Math.max(0, nichtPrioMax - andere);
  // Was der Tagesdeckel insgesamt noch hergibt, wenn Frischpfad + übrige laufen.
  const deckelRest = Math.max(0, deckel - frisch - andere);
  const rueckstandKi = Math.max(0, Math.min(physisch, nichtPrioFrei, deckelRest));
  // Priorisierter Frischpfad: kann durch nicht priorisierte Buchungen nie unter
  // (deckel − nichtPrioMax) = reserve gedrückt werden; hier zusätzlich gedeckelt
  // durch den Gesamtdeckel.
  const nichtPrioGesamt = Math.min(andere + rueckstandKi, nichtPrioMax);
  const frischKiWirksam = Math.min(frisch, Math.max(0, deckel - nichtPrioGesamt));
  const gesamtKi = Math.min(deckel, frischKiWirksam + nichtPrioGesamt);
  const verstehenKi = frischKiWirksam + rueckstandKi;
  const abflussProTag = verstehenKi / jeErgebnis;

  return {
    gueltig: true,
    rueckstandKiProTag: rueckstandKi,
    frischKiWirksamProTag: frischKiWirksam,
    verstehenKiProTag: verstehenKi,
    gesamtKiProTag: gesamtKi,
    abflussProTag,
    deckelWirdErreicht: gesamtKi >= deckel
  };
}

module.exports = {
  RUECKSTAND_CALLTYPE,
  FENSTER_DEFAULT,
  LAUF_DECKEL_DEFAULT,
  BUDGET_BODEN_DEFAULT,
  rueckstandFenster,
  rueckstandLaufDeckel,
  rueckstandBudgetBoden,
  baueRueckstandsWaechter,
  vorabBodenPruefung,
  kapazitaetsRechnung
};
