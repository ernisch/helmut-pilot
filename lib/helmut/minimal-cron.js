"use strict";

// Helmut — MINIMAL-CRON-ARCHITEKTUR für 500 Mandate (Vorbereitung, 2026-09-01).
// =====================================================================================
// ZIELARCHITEKTUR (verbindlich, Betreiberauftrag 500-Mandate-Reife):
//   1. Der VORHANDENE Motor wird weiterverwendet (Rückstandsschleife
//      /api/cron/understanding-rueckstand mit CAS, Fencing, Restzeitwache,
//      Laufbilanz, Laufdeckel und Budget-Boden — byte-identisch).
//   2. KEIN SQS und kein neuer Warteschlangenmotor.
//   3. Parallelität EINS (HELMUT_VERSTEHEN_PARALLELITAET bleibt ungesetzt ⇒ 1).
//   4. Minimal mögliche Komplexität: KEINE neue Route, KEIN neuer Handler,
//      KEIN Flag — die Aktivierung ist ausschließlich eine spätere, gesondert
//      freizugebende vercel.json-Änderung des Betreibers.
//   5. `18,48 * * * *` als VORBEREITETER Rhythmus: 48 tägliche Slots (jede
//      Stunde :18 und :48), die die beiden heutigen Rückstandsslots
//      (11:30/17:30 UTC) ERSETZEN — netto +46 Invocations/Tag (dokumentierter
//      PR-B-Anker, docs/betrieb/understanding-kapazitaet-2026-08-31.md §13.3).
//   6. KEINE tatsächliche Cron-Änderung in Production: dieses Modul trägt den
//      Vertrag; vercel.json bleibt unverändert (testgesichert — die 13
//      Bestandseinträge sind in acht Vertragssuiten exakt gepinnt).
//
// WARUM :18/:48 — und was die Wahl belegt (geschärft 2026-09-01, Befund 6):
// Belegt ist ausschließlich STARTZEITKOLLISIONSFREIHEIT: kein Slot startet zur
// selben Minute wie ein bestehender Cron (bestehende Minuten: 0, 10, 22, 30, 45;
// kleinster Startabstand 3 Minuten, 05:45-Lage-Briefing zu :48). Belegt ist
// außerdem, dass sich zwei RÜCKSTANDSLÄUFE nie überschneiden: die harte
// 280-s-Deadline liegt weit unter dem 30-Minuten-Slottakt, und das globale
// Understanding-Schloss (TTL 10 min) serialisiert zusätzlich alle
// VERSTEHENSLÄUFE untereinander (auch gegen understanding-Cron und Queue).
// NICHT belegt und ausdrücklich OFFEN: die LAUFZEITÜBERSCHNEIDUNG mit
// arbeitsfremden Nachbar-Crons. Konkret darf das 05:45-Lage-Briefing bis zu
// 300 s laufen (vercel.json maxDuration) — der 05:48-Slot startet dann, während
// es noch arbeitet. Die beiden teilen KEIN Schloss (das Understanding-Schloss
// gilt nur für Verstehensläufe; Briefings laufen nicht hindurch); gemeinsam sind
// der atomare KI-Tageszähler (nebenläufigkeitssicher am Choke-Point) und die
// Datenbank. Dass gleichzeitiger Betrieb funktional unbedenklich ist, ist damit
// plausibel, aber NICHT nachgewiesen — der Aktivierungsnachweis (Schritt
// "nachweis" unten) muss genau diesen Slot prüfen. laufzeitUeberschneidungen()
// benennt die betroffenen Paare maschinenlesbar.
//
// KAPAZITÄT: 48 Slots × Laufdeckel (Default 20) = 960 mögliche Verstehens-
// aufrufe/Tag physisch — die Slotzahl ist damit für den 500-Mandate-Bedarf
// (siehe lib/helmut/kapazitaet-500.js) kein Engpass mehr; bindend bleibt
// ausschließlich der KI-Tagesdeckel (fail-closed am atomaren Choke-Point).
// Vollast-Funktionszeit: 48 × ≤ 240 s Loop-Budget = ≤ 3,2 Funktionsstunden/Tag;
// budgetlose Slots enden dank Vorab-Bodenprüfung (verstehen-rueckstand.js) in
// Sekunden statt ~225 s zu verbrennen.

const MINIMAL_CRON_RHYTHMUS = "18,48 * * * *";
const MINIMAL_CRON_ROUTE = "/api/cron/understanding-rueckstand";
const ERSETZTE_BESTANDSSLOTS = Object.freeze(["30 11 * * *", "30 17 * * *"]);
const SLOT_LOOP_BUDGET_MS = 240000;   // unverändertes HELMUT_UNDERSTAND_BUDGET_MS-Default
const SLOT_DEADLINE_MS = 280000;      // unveränderte harte Antwortgrenze des Aufrufers

// Strenger Parser NUR für die Form "M1,M2 * * * *" (zwei Minuten, jede Stunde,
// jeden Tag). Alles andere ⇒ null — bewusst KEINE allgemeine Cron-Auswertung
// (op25-nachweis.parseTagesplan bleibt der Parser der schweren Tagespläne und
// ist von diesem Rhythmus nicht betroffen: er gilt nur für crawl/pipeline).
function parseMinutenRhythmus(schedule) {
  const teile = String(schedule || "").trim().split(/\s+/);
  if (teile.length !== 5) return null;
  const [min, std, tag, monat, wochentag] = teile;
  if (std !== "*" || tag !== "*" || monat !== "*" || wochentag !== "*") return null;
  const minuten = min.split(",").map((m) => Number(m));
  if (minuten.length !== 2) return null;
  if (!minuten.every((m) => Number.isInteger(m) && m >= 0 && m <= 59)) return null;
  if (minuten[0] === minuten[1]) return null;
  return { minuten: [...minuten].sort((a, b) => a - b), slotsJeTag: 24 * minuten.length };
}

// Alle 48 Slotzeiten (UTC) des vorbereiteten Rhythmus, deterministisch sortiert.
function slotZeitenUtc(schedule = MINIMAL_CRON_RHYTHMUS) {
  const plan = parseMinutenRhythmus(schedule);
  if (!plan) return [];
  const zeiten = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of plan.minuten) zeiten.push({ stunde: h, minute: m });
  }
  return zeiten;
}

// Kleinster Minutenabstand des Rhythmus zu den BESTEHENDEN Tagesplan-Crons
// (Form "M H * * *"). Nicht parsebare Einträge zählen konservativ als Abstand 0
// (fail closed: ein unbekannter Plan gilt als potenzielle Kollision).
function minutenAbstandZuBestehenden(vercelCrons = [], schedule = MINIMAL_CRON_RHYTHMUS) {
  const plan = parseMinutenRhythmus(schedule);
  if (!plan) return null;
  let kleinster = Infinity;
  for (const c of Array.isArray(vercelCrons) ? vercelCrons : []) {
    const teile = String((c && c.schedule) || "").trim().split(/\s+/);
    if (teile.length !== 5 || teile[2] !== "*" || teile[3] !== "*" || teile[4] !== "*") return 0;
    const m = Number(teile[0]);
    const h = Number(teile[1]);
    if (!Number.isInteger(m) || !Number.isInteger(h)) return 0;
    for (const slotMin of plan.minuten) {
      const d = Math.abs(m - slotMin);
      kleinster = Math.min(kleinster, Math.min(d, 60 - d));
    }
  }
  return Number.isFinite(kleinster) ? kleinster : null;
}

// OFFENER PUNKT (Befund 6): Slotstarts, die in die mögliche LAUFZEIT eines
// bestehenden Tagesplan-Crons fallen (Cron-Start + maxLaufzeitMs). Für jeden
// Treffer ist die Überschneidungsfreiheit NICHT belegt — die Paare gehören in
// den Aktivierungsnachweis. Nicht parsebare Einträge zählen konservativ als
// Treffer (fail closed).
//
// KORREKTUR 02.09. (adversarialer Review, bestätigter Befund): Die Rechnung lief
// nur in EINE Richtung („Slot startet in der Cron-Laufzeit") und meldete deshalb
// genau EIN Paar. Ein Slot läuft aber selbst bis zu 280 s — die umgekehrte
// Richtung („Bestandscron startet in der Slot-Laufzeit") fehlte vollständig.
// Mit ihr sind es an den 13 Bestandscrons ZWEI Paare:
//   1. lage-briefing 05:45 → Slot 05:48   (Slot startet in der Cron-Laufzeit)
//   2. Slot 06:18 → lage-briefing-nachlauf 06:22 (Cron startet in der Slot-Laufzeit)
// Die frühere Aussage „genau EIN Paar" war zu grün und ist zurückgenommen.
function laufzeitUeberschneidungen(vercelCrons = [], { maxLaufzeitMs = 300000, schedule = MINIMAL_CRON_RHYTHMUS } = {}) {
  const plan = parseMinutenRhythmus(schedule);
  const maxMin = Number(maxLaufzeitMs) / 60000;
  if (!plan || !Number.isFinite(maxMin) || maxMin <= 0) return null;
  const treffer = [];
  for (const c of Array.isArray(vercelCrons) ? vercelCrons : []) {
    const teile = String((c && c.schedule) || "").trim().split(/\s+/);
    const pfad = String((c && c.path) || "");
    if (pfad === MINIMAL_CRON_ROUTE) continue; // eigene Slots: per Deadline+Schloss belegt überschneidungsfrei
    if (teile.length !== 5 || teile[2] !== "*" || teile[3] !== "*" || teile[4] !== "*"
      || !Number.isInteger(Number(teile[0])) || !Number.isInteger(Number(teile[1]))) {
      treffer.push({ path: pfad || "(unbekannt)", schedule: String((c && c.schedule) || ""), grund: "nicht-parsebar" });
      continue;
    }
    const cronMin = Number(teile[0]);
    for (const slotMin of plan.minuten) {
      // RICHTUNG 1 (bisher): der Slot startet, während der Bestandscron noch laufen kann.
      const abstand = (slotMin - cronMin + 60) % 60; // Minuten vom Cron-Start bis zum nächsten Slotstart
      if (abstand === 0) {
        treffer.push({ path: pfad, schedule: c.schedule, slotMinute: slotMin, abstandMin: 0, grund: "gleiche-startminute" });
        continue;
      }
      if (abstand > 0 && abstand < maxMin) {
        treffer.push({ path: pfad, schedule: c.schedule, slotMinute: slotMin, abstandMin: abstand, grund: "slot-startet-in-moeglicher-laufzeit" });
        continue;
      }
      // RICHTUNG 2 (ergänzt 02.09., adversarialer Review — bestätigter Befund):
      // der Bestandscron startet, während der SLOT noch arbeitet. Ein Slot läuft
      // bis zu SLOT_DEADLINE_MS = 280 s = 4:40 min. Nachgerechnet an den 13
      // Bestandscrons: Slot :18 läuft bis :22:40, und `lage-briefing-nachlauf`
      // startet um 06:22 — dieses Paar hat die alte, einseitige Rechnung
      // übersehen. Eine Überschneidungsprüfung, die nur in eine Richtung rechnet,
      // ist keine.
      const rueck = (cronMin - slotMin + 60) % 60;   // Minuten vom Slotstart bis zum Cronstart
      const slotMaxMin = SLOT_DEADLINE_MS / 60000;
      if (rueck > 0 && rueck < slotMaxMin) {
        treffer.push({
          path: pfad, schedule: c.schedule, slotMinute: slotMin, abstandMin: rueck,
          grund: "cron-startet-in-slotlaufzeit"
        });
      }
    }
  }
  return treffer;
}

// Physische Tageskapazität des vorbereiteten Rhythmus (Obergrenze der
// Rückstands-Modellaufrufe je Tag). Der KI-Tagesdeckel bleibt die bindende
// Grenze — diese Zahl beweist nur, dass die SLOTZAHL kein Engpass mehr ist.
function tagesKapazitaet({ slotsJeTag = 48, laufDeckel = 20, aufrufeJeSlotPhysisch = 19 } = {}) {
  const s = Number(slotsJeTag);
  const d = Number(laufDeckel);
  const p = Number(aufrufeJeSlotPhysisch);
  if (![s, d, p].every((n) => Number.isFinite(n) && n > 0)) return null;
  return { maxAufrufeJeTag: Math.floor(s * Math.min(d, p)), begrenztDurch: d <= p ? "laufdeckel" : "slotzeit" };
}

// Erwartete Laufzeit je Slot — aus Naturlaufwerten (31.08.: 222,9 s voll,
// 225,6 s budgetlos OHNE Vorab-Bodenprüfung) und den unveränderten Zeitgrenzen.
// Mit Vorab-Bodenprüfung endet ein budgetloser Slot vor jeder Lesearbeit.
function erwarteteLaufzeitJeSlot() {
  return Object.freeze({
    vollerSlotMs: { gemessen: 222900, obergrenze: SLOT_DEADLINE_MS },
    budgetloserSlotMs: { mitVorabBoden: 5000, ohneVorabBoden: 225600 },
    loopBudgetMs: SLOT_LOOP_BUDGET_MS,
    deadlineMs: SLOT_DEADLINE_MS
  });
}

// Die AKTIVIERUNG bleibt eine gesonderte Betreiberentscheidung. Diese Liste ist
// der maschinenlesbare Vertrag der nötigen Schritte — sie schaltet nichts frei.
function aktivierungsVoraussetzungen() {
  return Object.freeze([
    { schritt: "betreiber-freigabe", beschreibung: "Ausdrückliche Freigabe für die Cron-Änderung (CLAUDE.md §5: Cron-Zeiten ändern ist freigabepflichtig)." },
    { schritt: "vercel-json", beschreibung: `In vercel.json die zwei Einträge ${ERSETZTE_BESTANDSSLOTS.join(" und ")} für ${MINIMAL_CRON_ROUTE} durch EINEN Eintrag mit "${MINIMAL_CRON_RHYTHMUS}" ersetzen (netto +46 Invocations/Tag).` },
    { schritt: "slot-plan", beschreibung: "SLOT_PLAN (lib/helmut/motor-health.js): den Eintrag understanding-rueckstand von [11.5, 17.5] auf das 48-Slot-Modell umstellen (Toleranz-/Rastermodell prüfen — 3-h-Toleranz passt nicht zu 30-min-Takt) oder den Eintrag mit Begründung entfernen; selbstAnker-Semantik beibehalten." },
    { schritt: "cron-vertragstests", beschreibung: "Die acht pinnenden Cron-Vertragssuiten (cron-globalphase, cron-fairness, cron-fairness-persistenz, scalable-pipeline-flag, warteschlangen-abfluss, verstehen-rueckstand §11, morgenkapazitaet) auf den neuen 12-Einträge-Plan nachführen — im SELBEN Commit wie die vercel.json-Änderung." },
    { schritt: "tagesdeckel", beschreibung: "HELMUT_MAX_LLM_CALLS_PER_DAY auf den freigegebenen Deckel setzen (vorläufiger Planungswert: lib/helmut/kapazitaet-500.js zielDeckel(); ohne Deckel-Erhöhung sind die 48 Slots wirkungslos — der Deckel bindet)." },
    { schritt: "verstehens-reserve", beschreibung: "HELMUT_LLM_RESERVE_UNDERSTANDING auf die zum Deckel gehörende Verstehens-Reserve setzen (kapazitaet-500 reserveVerstehen; ZWEITER, GETRENNT freizugebender Wert neben dem Gesamtdeckel). Die Reserve ist ein Anteil INNERHALB des Deckels und wird NIE addiert (effectiveMax = Deckel − Reserve für nicht priorisierte Arbeit; kanonisch llm-budget-reservierung.md). Ohne belegte, zum Deckel passende Reserve ist die Aktivierung NICHT bereit: der alte Reservewert schützt das Frischverstehen unter dem neuen Deckel nicht mehr." },
    { schritt: "nachweis", beschreibung: "Nach dem Deploy 2-3 natürliche Slots rein lesend prüfen (Quittungen understanding-rueckstand: Erlaubnisse ≤ Laufdeckel, Boden gehalten, budgetlose Slots enden per Vorab-Bodenprüfung in Sekunden) — DARUNTER ZWINGEND der 05:48-Slot neben dem 05:45-Lage-Briefing: die Laufzeitüberschneidung dieser beiden ist OFFEN (laufzeitUeberschneidungen()) und erst mit diesem Beleg geschlossen." }
  ]);
}

module.exports = {
  MINIMAL_CRON_RHYTHMUS,
  MINIMAL_CRON_ROUTE,
  ERSETZTE_BESTANDSSLOTS,
  SLOT_LOOP_BUDGET_MS,
  SLOT_DEADLINE_MS,
  parseMinutenRhythmus,
  slotZeitenUtc,
  minutenAbstandZuBestehenden,
  laufzeitUeberschneidungen,
  tagesKapazitaet,
  erwarteteLaufzeitJeSlot,
  aktivierungsVoraussetzungen
};
