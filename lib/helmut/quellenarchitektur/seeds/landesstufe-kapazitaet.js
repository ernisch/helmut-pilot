"use strict";

// Helmut — Sprint "Berlin/Brandenburg-Vorrat" (2026-08-18): KAPAZITAETSMODELL fuer eine
// spaetere kontrollierte Stufe mit 5 Bestandsmandaten + 5/10/20 zusaetzlichen
// Landtags-Testmandaten (Berlin/Brandenburg).
// =============================================================================================
// REINE, DETERMINISTISCHE RECHNUNG. Kein Netz, keine KI, kein Storage, keine Uhr. Jede
// Eingabe traegt ihre HERKUNFT (gemessen | prognose | simuliert | annahme) und ihren Beleg —
// eine Zahl ohne Herkunft ist hier ein Testfehler, kein Stilproblem. Das Modell behauptet
// keine Production-Beweise; es macht die Rechnung nachvollziehbar, die vor einer Freigabe
// gegen echte Messungen ersetzt werden muss.

// --- Eingaben (Stand 2026-08-18) --------------------------------------------------------------
const EINGABEN = Object.freeze({
  bestandMandate: Object.freeze({
    wert: 5, herkunft: "gemessen",
    beleg: "docs/CURRENT_STATE.md §3 — 5 aktive Mandate, Signatur m5-9aee228dbf2c9f13 (K2, 2026-08-06)"
  }),
  llmTagesdeckel: Object.freeze({
    wert: 100, reserve: 30, herkunft: "annahme",
    beleg: "docs/CURRENT_STATE.md §4 (LLM-Tagesbudget 100 + Reserve 30, fail-closed). ACHTUNG: "
      + "laut Roadmap-Punkt 9 (Korrektur 2026-08-08) ist '100' eine Runbook-Empfehlung; der "
      + "Code-Fallback ist 50, und der in Production wirksame Wert ist offline nicht lesbar."
  }),
  globalLlmProTag: Object.freeze({
    mittel: 64, spitze: 100, herkunft: "gemessen",
    beleg: "docs/betrieb/berlin-aktivierung.md §7.1 — LLM-Aufrufe/Tag Mittel 64, Max 100 "
      + "(read-only gemessen 2026-07-26; aeltere Architektur, vor CAS)"
  }),
  mandatsbezogeneLlmProMandatTag: Object.freeze({
    wert: 1.05, herkunft: "simuliert",
    beleg: "docs/betrieb/skalierung-200-mandate.md §3 — realistisch 210 mandatsbezogene Aufrufe "
      + "bei 200 Mandaten (210/200 = 1,05); Simulation, kein Production-Messwert"
  }),
  berlinZusatzLlmProTag: Object.freeze({
    min: 1, max: 2.6, herkunft: "prognose",
    beleg: "docs/betrieb/berlin-aktivierung.md §7.3 — +1 bis +2,6 LLM-Aufrufe/Tag fuer das "
      + "4-Wege-Aktivierungsset (auf Messbasis gerechnet, nie in Production belegt)"
  }),
  rohdokumenteIstProTag: Object.freeze({
    wert: 277, herkunft: "gemessen",
    beleg: "docs/betrieb/berlin-aktivierung.md §7.1 (1937 Dokumente in 7 Tagen, 2026-07-26)"
  }),
  berlinRohdokumenteProTag: Object.freeze({
    min: 4.6, max: 11.4, herkunft: "prognose",
    beleg: "docs/betrieb/berlin-aktivierung.md §7.3 — realistisch fuer die 4 Berliner Wege; "
      + "Erstlauf einmalig bis 64 Dokumente"
  }),
  brandenburgRohdokumenteProTag: Object.freeze({
    wert: null, herkunft: "annahme",
    beleg: "KEINE Messung. Der PARDOK-Dispatch liefert strukturell items: [] (Cutover "
      + "freigabepflichtig, Roadmap Punkt 27/OP-21); die RSS-/Suchwege Brandenburgs wurden nie "
      + "abgerufen. Bis zur ersten Messung wird KEIN Wert behauptet."
  }),
  narrativKostenProMandatMorgenUsd: Object.freeze({
    wert: 0.001307, herkunft: "gemessen",
    beleg: "docs/betrieb/op30-kapazitaet-morgenslots-2026-08-09.md §8 — Mittelwert von 126 "
      + "bepreisten Production-Aufrufen (Messreihe, kein Anbieterpreis); nur das Lage-Narrativ"
  }),
  llmKostenIstProTagUsd: Object.freeze({
    wert: 0.14, herkunft: "gemessen",
    beleg: "docs/betrieb/kostenmessung.md — Untergrenze ~0,14 USD/Betriebstag, Preisbasis "
      + "unbelegt, ~16 % Logverlust (K-1/K-2)"
  }),
  altpfadBefund: Object.freeze({
    herkunft: "gemessen",
    beleg: "docs/CURRENT_STATE.md §3/§7a — 16:00-Lauf endete bei n=5 nach ~4 min (Limit "
      + "270/280 s); OP-30-Versuch 2: Ankunft ~440-470 Auftraege/Tag gegen Abfluss ~130-180/Tag "
      + "bei 5 Mandaten (Runbook §19.4/§19.5)"
  }),
  neuerMotor25: Object.freeze({
    laufzeitSekunden: 60, reserveProzent: 89.3, parallelitaet: 2, slots: 1, herkunft: "simuliert",
    beleg: "docs/betrieb/op30-kapazitaet-morgenslots-2026-08-09.md §7.1/§10 Stufe 2 — 25 Mandate "
      + "25/25 im Fenster, Reserve 89,3 %, Laufzeit < 60 s; lokale Simulation, kein Production-Beweis"
  })
});

// Zulaessige Stufen des Auftrags: +5, +10, +20 Zusatzmandate.
const STUFEN = Object.freeze([5, 10, 20]);

function rund(x, stellen = 2) {
  const f = Math.pow(10, stellen);
  return Math.round(x * f) / f;
}

// --- Kernrechnung -----------------------------------------------------------------------------
// zusatzMandate: 5 | 10 | 20 (andere Werte sind erlaubt, aber als "ausserhalb des Auftrags"
// markiert). Rueckgabe: vollstaendig nachvollziehbare Stufe inkl. aller Annahmen und der
// ehrlichen Testbarkeitsaussage.
function berechneLandesstufe(zusatzMandate) {
  const n = Number(zusatzMandate);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, fehler: `ungueltige Zusatzmandatszahl: ${zusatzMandate}` };
  }
  const E = EINGABEN;
  const mandateGesamt = E.bestandMandate.wert + n;

  // Modellaufrufe je Tag: globales Verstehen (skaliert mit Quellen/Dokumenten, NICHT mit
  // Mandaten) + mandatsbezogene Aufrufe (Narrativ/Briefing je Mandat) + Berliner Zusatz.
  const mandatsbezogen = rund(mandateGesamt * E.mandatsbezogeneLlmProMandatTag.wert, 1);
  const llmMittel = rund(E.globalLlmProTag.mittel + mandatsbezogen + E.berlinZusatzLlmProTag.max, 1);
  const llmSpitze = rund(E.globalLlmProTag.spitze + mandatsbezogen + E.berlinZusatzLlmProTag.max, 1);
  const deckel = E.llmTagesdeckel.wert;
  const deckelMitReserve = E.llmTagesdeckel.wert + E.llmTagesdeckel.reserve;

  // Quellen: die Bundeswege bleiben global-once (keine Zusatzabrufe je Mandat); dazu kommen
  // je aktivem Landesmodul die Landeswege und je AKTIVEM Mandat eine Laufzeit-Personenquelle
  // (scheduler.personNewsSource, id <mandats-id>-news).
  const quellen = {
    bundGlobalOnce: { wege: 140, hinweis: "gemessen 2026-07-26 (§21.5 berlin-aktivierung); global einmal je Lauf" },
    berlinAktivierungsset: { wege: 4, stufe1: 2, hinweis: "Aktivierungsset §7.4; berlin-basis traegt insgesamt 7 Wege" },
    brandenburgBasis: { wege: 8, liefernd: 0, hinweis: "8/8 manual/needs_review; PARDOK-Dispatch liefert items: [] — 0 liefernde Wege bis zum freigabepflichtigen Cutover" },
    personenquellenZurLaufzeit: n + E.bestandMandate.wert
  };

  // Rohdokumente je Tag (Bund-Ist + Berlin-Prognose; Brandenburg ehrlich unbekannt).
  const dokumente = {
    istBund: E.rohdokumenteIstProTag.wert,
    berlinMin: E.berlinRohdokumenteProTag.min,
    berlinMax: E.berlinRohdokumenteProTag.max,
    brandenburg: null,
    brandenburgHinweis: E.brandenburgRohdokumenteProTag.beleg,
    gesamtMin: rund(E.rohdokumenteIstProTag.wert + E.berlinRohdokumenteProTag.min, 1),
    gesamtMaxOhneBrandenburg: rund(E.rohdokumenteIstProTag.wert + E.berlinRohdokumenteProTag.max, 1)
  };

  // Kosten (nur belegbare Posten; alles andere bleibt ausgewiesen offen).
  const kosten = {
    narrativProTagUsd: rund(mandateGesamt * E.narrativKostenProMandatMorgenUsd.wert, 4),
    verstehenIstUntergrenzeProTagUsd: E.llmKostenIstProTagUsd.wert,
    hinweis: "Narrativ = Messreihe je Mandat/Morgen; Verstehen = heutige Untergrenze, waechst mit "
      + "der Dokumentmenge (Berlin +2-4 %, Brandenburg unbekannt), nicht mit der Mandatszahl."
  };

  // Testbarkeit — die zentrale ehrliche Aussage dieses Modells.
  const altpfadTestbar = false; // fuer JEDE der drei Stufen, Begruendung unten
  const testbarkeit = {
    altpfad: {
      testbar: altpfadTestbar,
      begruendung: "Der heutige Pfad ist bei n=5 bereits nahe am Zeitlimit (16:00-Lauf ~4 min bei "
        + "270/280 s) und OP-30-Versuch 2 scheiterte bei 5 Mandaten an Abfluss 130-180 gegen "
        + "Ankunft 440-470 Auftraege/Tag. Zusaetzliche Mandate erhoehen die mandatsbezogene "
        + "Arbeit linear — keine der drei Stufen ist auf dem Altpfad seriös testbar.",
      beleg: E.altpfadBefund.beleg
    },
    neuerMotor: {
      testbar: n <= 20,
      voraussetzungen: [
        "OP-30-Wirkungskontrolle gruen (HELMUT_VERSTEHEN_CAS-Betrieb stabil; Abflussraten-Entscheidung §19.4)",
        "HELMUT_SCALABLE_PIPELINE=on + HELMUT_JOB_DISPATCH_MODE (Stufenplan Runbook §6/§14 — Freigabe noetig)",
        "OP-25 vollstaendig wiederholen (gilt nach JEDER OP-30-Aktivierung)",
        "Berlin-Aktivierung nach berlin-aktivierung.md §9 (eigene Freigabe-Serie, Neuverifikation der Quellen)",
        "Brandenburg zusaetzlich: PARDOK-Live-Ingest-Cutover (externe Kennung durchreichen, §C.5) — sonst 0 liefernde BB-Wege"
      ],
      beleg: E.neuerMotor25.beleg,
      simuliert: { laufzeitSekunden: E.neuerMotor25.laufzeitSekunden, reserveProzent: E.neuerMotor25.reserveProzent }
    },
    deckel: {
      mittelPasst: llmMittel <= deckel,
      spitzentagPasst: llmSpitze <= deckel,
      mitReservePasst: llmSpitze <= deckelMitReserve,
      hinweis: llmSpitze <= deckel
        ? "Auch der gemessene Spitzentag bliebe unter dem Deckel."
        : "Am gemessenen Spitzentag (global 100) liegt die Summe ueber dem Deckel 100 — das "
          + "Budget ist fail-closed (Arbeit verschiebt sich auf den Folgetag, kein Bruch), aber "
          + "ein Beweisfenster braucht entweder einen ruhigen Tag oder eine Deckelanhebung "
          + "(Betreiberentscheidung, nie Teil dieses Vorrats)."
    }
  };

  const annahmen = [
    "Der wirksame Production-Deckel ist offline nicht lesbar (Runbook-Empfehlung 100, Code-Fallback 50).",
    "1,05 mandatsbezogene Aufrufe je Mandat/Tag stammen aus der 200-Mandate-Simulation, nicht aus Production.",
    "Das globale Verstehen (Mittel 64) stammt aus der Architektur VOR dem CAS-Umbau (gemessen 2026-07-26).",
    "Brandenburgs Dokument- und Aufrufmenge ist vollstaendig ungemessen (PARDOK-Cutover fehlt).",
    "Die Narrativ-Preisbasis ist eine Messreihe (126 Aufrufe), kein Anbieterpreis; Fehlaufrufe kosten unbekannt.",
    "Cron-Zeiten unveraendert (crawl 04:00/20:00 · pipeline 16:00 · morning 05:00 · understanding 05:30/21:30 · lage 05:45 UTC)."
  ];
  const fehlendeMessungen = [
    "Wirksamer LLM-Tagesdeckel in Production (nur wirkungsbasiert pruefbar).",
    "Brandenburg: Dokumente/Tag und LLM-Zusatz je Weg (erste Messung erst nach PARDOK-Cutover moeglich).",
    "Berlin: realer Ertrag der 4 Wege ueber mehrere Laeufe (der einzige Aktivierungslauf brach vor der Telemetrie ab).",
    "Mandatsbezogene Aufrufe je Mandat/Tag unter CAS (die 1,05 sind Simulation).",
    "Wirkung von HELMUT_LANDESMODULE in Production (weiterhin unbewiesen, CURRENT_STATE §9)."
  ];

  return {
    ok: true,
    imAuftrag: STUFEN.includes(n),
    zusatzMandate: n,
    mandateGesamt,
    llm: { mandatsbezogen, mittel: llmMittel, spitze: llmSpitze, deckel, deckelMitReserve },
    quellen,
    dokumente,
    kosten,
    testbarkeit,
    annahmen,
    fehlendeMessungen
  };
}

module.exports = { EINGABEN, STUFEN, berechneLandesstufe };
