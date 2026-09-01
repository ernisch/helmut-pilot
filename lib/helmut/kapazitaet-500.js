"use strict";

// Helmut — TAGESKAPAZITÄTSMODELL für 500 Mandate (500-Mandate-Reife, 2026-09-01;
// Einordnung geschärft im Korrektursprint am selben Tag, Befund 4).
// =====================================================================================
// Ausführbarer Rechenbeleg (keine theoretische Aussage ohne Rechenbeleg): das
// Mengenmodell, das der Beleg docs/betrieb/500-mandate-theoretische-bereitschaft-
// 2026-09-01.md dokumentiert, als reine Funktion — testgesichert durch
// scripts/kapazitaet-500-test.js. Es setzt KEINEN Deckel und ändert NICHTS an
// Production.
//
// EINORDNUNG (Befund 4): Jeder hier berechnete Deckelwert ist ein VORLÄUFIGER
// SZENARIO-/PLANUNGSWERT — er beruht auf benannten Szenarioannahmen
// (abdeckungsFaktor, personGesundJeMandat, mandatsgebundenJeMandat), nicht auf
// finalen Messungen. Er ist ausdrücklich NICHT der „kleinste belegbar
// ausreichende Zieldeckel". Die VERBINDLICHE Deckelbestimmung folgt dem
// Z3b-Aktivierungsplan (PR #277, Kopf a705c18) und braucht noch: echte
// p95-Tagesbedarfe je Fachweg (Verstehen, Lage, Büro), die echten
// Azure-Kontingente/Rate-Limits, einen vollständigen Fachwegbericht und die
// Fairness-Untergrenze — alles offene externe Messungen (siehe
// zielDeckel().offeneMessungen).
//
// DIE DREI VERSCHIEDENEN „455" (Befund 4 — Einheiten NICHT stillschweigend
// vermengen; die Zahlengleichheit von (a) mit (b) ist Zufall):
//   (a) skalierung-25-50-100.md §2: 455 WARTESCHLANGEN-AUFTRÄGE/Tag bei
//       5 Mandaten (338 source_fetch + 98 verstehen + 19 mandatsgebunden) —
//       Aufträge, keine Modellaufrufe, und eine andere Mandatszahl.
//   (b) understanding-kapazitaet-2026-08-31.md §13.3: ~455 KI-AUFRUFE/Tag
//       Verstehens-Bedarf bei 500 Mandaten (Annahme quellenkonstanter Last).
//   (c) dieses Modell: 456 = ERWARTUNGSWERT des Verstehens-KI-Bedarfs bei 500
//       (Szenario „erwartung"). (c) bestätigt (b) als Erwartungswert.
//
// BEFUND ZUR FRÜHEREN 455 = (b) (nachgerechnet): sie ist bestätigt, aber als
// PLANUNGSGRUNDLAGE unvollständig: sie beruhte auf der Annahme quellenkonstanter
// Verstehenslast („10 Mandate ohne neue Quellen erzeugen ≈ dieselbe Last").
// Rein lesend gemessen (24.–30.08. bzw. 30-Tage-Fenster) erzeugen die
// PROFILGETRIEBENEN Quellen der 5 aktiven Mandate aber bereits ~57
// Rohdokumente/Tag (~51 Vorgänge/Tag) — Themen-, Regions-, Fraktions- und
// Personensuchen entstehen zur Laufzeit aus dem Profil und WACHSEN mit der
// Mandatszahl (sublinear durch Dedup/Themenraum-Konvergenz, aber nicht null).
// Der konservative Bedarf liegt deshalb ÜBER 455; die Szenarien unten tragen das.

// ── MESSWERTE (Herkunft je Wert; rein lesend erhoben oder kanonisch dokumentiert) ────
const MESSWERTE = Object.freeze({
  // Vorgangs-Ankunft je Tag, GESAMT (Ø 7 volle Tage 24.–30.08., knowledge_objects)
  vorgangsAnkunftProTag: 307,
  // davon profilgetrieben: 1.716 Rohdokumente/30 T aus Profilquellen der 5 aktiven
  // Mandate (gemessen 31.08., source_id-Muster <slug>-news*), ×0,9 Vorgangs-Quote
  profilVorgaengeProTagBei5: 51,
  // Personensuche im Ist (OP-15-Versorgungsausfall, circuit-open): 47 Dokumente/30 T
  // über 5 Mandate = 0,31/Mandat/Tag — KEINE gesunde Basisrate, nur der Ist-Anker.
  personVorgaengeJeMandatIst: 0.03,
  // Gate-würdiger Anteil der BEWERTETEN Vorgänge: verstehen 91 + zurückstellen ~80
  // von 252 bewerteten je Tag (Schattenmessung §1; 14-T-Dokumentebene: 3.399 von
  // 4.843 = 0,70 — Vorgangsebene konservativer mit 0,68).
  // WICHTIG (Auftragsregel): „zurückstellen" kostet einen VOLLEN Modellaufruf —
  // nur echtes Parken spart ihn. Der Anteil enthält zurückstellen deshalb MIT.
  wuerdigAnteil: 0.68,
  aufrufeJeErgebnis: 1.09,       // gemessen (CAS-Reservierungen, Ø seit 17.08.)
  wiederholungsReserve: 1.10,    // gemessen: versuche Ø 1,10 (Fehler-/Retry-Reserve)
  mandatsgebundenJeMandatProTag: 1.2, // gemessen: 42 von 548 Aufrufen in 7 T bei 5 Mandaten
  andereVerbraucherProTag: 10,   // gemessen ~6–8, aufgerundet
  aktiveMandateBasis: 5,
  // Rückstandsabbau (gate-würdiger Bestand 1.599–4.000; Abbaupfade §4 des
  // Kapazitätsbelegs): +53 (90 T) / +100 (45 T) / +133 (30 T) Aufrufe je Tag.
  rueckstandsAbbauProTag: Object.freeze({ erwartung: 53, konservativ: 100, stress: 133 }),
  // Physische Verstehens-Slotkapazität je Tag mit Minimal-Cron (48×19 = 912,
  // lib/helmut/minimal-cron.js) + Frischläufe 2×19 + Queue-Verstehensphase ~29
  // + Lage ~5 (gemessene Slotleistungen).
  slotKapazitaetVerstehenProTag: 912 + 38 + 29 + 5,
  // Heutiger dokumentierter Production-Deckel (WIRD NICHT VERÄNDERT).
  heutigerTagesdeckel: 100,
  heutigeReserve: 30
});

// ── SZENARIOFAKTOREN (benannt; die Unsicherheit liegt GENAU hier und wird vom
// mehrtägigen Betriebsnachweis geschlossen, nicht von dieser Rechnung) ───────────────
const SZENARIEN = Object.freeze({
  // abdeckungsFaktor: Vervielfachung der profilgetriebenen DISTINCT-Ankunft bei
  // Vollabdeckung aller Ausschüsse/Länder/Parteien durch 500 Profile (heute decken
  // 5 Profile nur einen kleinen Themenraum; Dedup lässt den Zuwachs sublinear
  // konvergieren — 500/5 = 100× ist ausgeschlossen, 1× ebenso).
  // personGesundJeMandat: gesunde Personensuche NACH OP-15-Härtung (mandats-
  // spezifisch, kaum Überlappung; heute krank: 0,03).
  erwartung:   { abdeckungsFaktor: 3, personGesundJeMandat: 0.3, mandatsgebundenJeMandat: 1.2, abbau: "erwartung" },
  konservativ: { abdeckungsFaktor: 5, personGesundJeMandat: 0.7, mandatsgebundenJeMandat: 2.0, abbau: "konservativ" },
  stress:      { abdeckungsFaktor: 7, personGesundJeMandat: 1.2, mandatsgebundenJeMandat: 3.0, abbau: "stress" }
});

// Freie Kapazität nach Zielarchitektur (Bedarf ÷ 0,75 ⇒ 25 % Reserve im Deckel).
const FREIE_KAPAZITAET_FAKTOR = 0.75;

function rund(n) { return Math.round(n * 10) / 10; }

// ── DER VERSTEHENS-BEDARF EINES SZENARIOS (Aufrufe/Tag) ─────────────────────────────
// katalog bleibt konstant (geteilter zentraler Quellenkatalog: ein Vorgang wird
// GENAU EINMAL verstanden, egal wie viele Mandate ihn lesen); profilgetriebene
// Quellen wachsen mit Abdeckungsfaktor, Personensuchen je Mandat.
function verstehensBedarf({ mandate = 500, szenario = "konservativ", m = MESSWERTE } = {}) {
  const s = SZENARIEN[szenario];
  if (!s) return null;
  const katalog = m.vorgangsAnkunftProTag - m.profilVorgaengeProTagBei5;
  const profil = m.profilVorgaengeProTagBei5 * s.abdeckungsFaktor;
  const person = s.personGesundJeMandat * mandate;
  const wuerdigeVorgaenge = (katalog + profil + person) * m.wuerdigAnteil;
  const aufrufe = wuerdigeVorgaenge * m.aufrufeJeErgebnis * m.wiederholungsReserve;
  return {
    katalogVorgaenge: rund(katalog),
    profilVorgaenge: rund(profil),
    personVorgaenge: rund(person),
    wuerdigeVorgaenge: rund(wuerdigeVorgaenge),
    aufrufeProTag: Math.ceil(aufrufe)
  };
}

// ── DAS VOLLSTÄNDIGE TAGESMODELL EINES SZENARIOS ────────────────────────────────────
function tagesModell({ mandate = 500, szenario = "konservativ", m = MESSWERTE } = {}) {
  const s = SZENARIEN[szenario];
  if (!s) return null;
  const verstehen = verstehensBedarf({ mandate, szenario, m });
  const mandatsgebunden = Math.ceil(s.mandatsgebundenJeMandat * mandate);
  const abbau = m.rueckstandsAbbauProTag[s.abbau];
  const gesamt = verstehen.aufrufeProTag + mandatsgebunden + abbau + m.andereVerbraucherProTag;
  const fairnessUntergrenze = 2 * mandate - 1; // K1: tägliches Narrativ je Mandat bei 50 % Globalanteil
  const deckelMitReserve = Math.ceil(gesamt / FREIE_KAPAZITAET_FAKTOR);
  const slotVerstehenLast = verstehen.aufrufeProTag + abbau;
  return {
    szenario, mandate,
    verstehen,
    mandatsgebundenProTag: mandatsgebunden,
    rueckstandsAbbauProTag: abbau,
    andereVerbraucherProTag: m.andereVerbraucherProTag,
    gesamtBedarfProTag: gesamt,
    fairnessUntergrenze,
    erforderlicherDeckel: Math.max(deckelMitReserve, fairnessUntergrenze),
    slotVerstehenLastProTag: slotVerstehenLast,
    slotKapazitaetProTag: m.slotKapazitaetVerstehenProTag,
    slotKapazitaetReicht: slotVerstehenLast <= m.slotKapazitaetVerstehenProTag
  };
}

// ── ZIELDECKEL: VORLÄUFIGER SZENARIO-/PLANUNGSWERT (Befund 4) ───────────────────────
// Der Planungswert trägt den konservativen Szenario-Bedarf einschließlich 25 %
// Reserve UND die Fairness-Untergrenze — er ist damit die beste HEUTE rechenbare
// Planungsgröße, aber KEIN „kleinster belegbar ausreichender" Wert: seine
// Grundlage sind Szenarioannahmen, nicht finale Messungen. Die Rückgabe trägt
// deshalb eine SPANNE (Erwartung bis konservativ) und die offenen Messungen des
// Z3b-Aktivierungsplans, die vor einer verbindlichen Deckelfestlegung erhoben
// werden müssen. Der Stresswert wird ausdrücklich NICHT in den Deckel eingepreist
// (Stresstage bauen über die Rückstandsschleife an Folgetagen ab — dafür
// existiert sie); er definiert die Warnschwellen.
function zielDeckel({ mandate = 500, m = MESSWERTE } = {}) {
  const konservativ = tagesModell({ mandate, szenario: "konservativ", m });
  const erwartung = tagesModell({ mandate, szenario: "erwartung", m });
  const stress = tagesModell({ mandate, szenario: "stress", m });
  // Erforderliche Verstehens-Reserve im Deckel: der konservative priorisierte
  // Verstehens-Frischbedarf (die Reserve wird IM Deckel freigehalten, nie addiert).
  const reserve = konservativ.verstehen.aufrufeProTag;
  return {
    zielDeckel: konservativ.erforderlicherDeckel,
    einordnung: "vorlaeufiger-szenario-planungswert",
    spanne: {
      erwartung: erwartung.erforderlicherDeckel,
      konservativ: konservativ.erforderlicherDeckel
    },
    // Offene externe Messungen vor einer VERBINDLICHEN Deckelfestlegung
    // (Z3b-Aktivierungsplan, PR #277 Kopf a705c18):
    offeneMessungen: Object.freeze([
      "p95-tagesbedarf-verstehen",
      "p95-tagesbedarf-lage",
      "p95-tagesbedarf-buero",
      "azure-kontingente-und-rate-limits",
      "vollstaendiger-fachwegbericht"
    ]),
    reserveVerstehen: reserve,
    erwartung, konservativ, stress,
    heutigerDeckel: m.heutigerTagesdeckel,
    hinweis: "Vorläufiger Szenario-/Planungswert als Betreiberempfehlung — KEINE finale Dimensionierung; das Setzen von HELMUT_MAX_LLM_CALLS_PER_DAY bleibt eine freigabepflichtige Production-Änderung und braucht zuvor die offenen Messungen (offeneMessungen)."
  };
}

// ── WARNSCHWELLEN (klar, prüfbar; Grundlage: Drain-Bilanz + Quittungen) ─────────────
function warnSchwellen({ m = MESSWERTE } = {}) {
  return Object.freeze([
    { kennung: "W1-deckelnähe", regel: "Tagesverbrauch ≥ 85 % des gesetzten Deckels an 2 aufeinanderfolgenden Tagen", quelle: "llm_budget_counters" },
    { kennung: "W2-drain-rot", regel: "Drain-Bilanz ⚠ (gate-würdiger Abfluss < Ankunft ODER Rückstand wächst) an 3 aufeinanderfolgenden Tagen", quelle: "Gesundheitsbericht (drainBilanzZeile)" },
    { kennung: "W3-slotgrenze", regel: `Ø Aufrufe je Rückstandsslot ≥ 17 (≥ 90 % der physischen ~19) über einen Tag — Slotkapazität ${m.slotKapazitaetVerstehenProTag}/Tag rückt in Reichweite`, quelle: "process_runs (telemetrie.rueckstand.erlaubnisse)" },
    { kennung: "W4-fehlversuche", regel: "Fehlversuchsquote der Rückstandsläufe ≥ 20 % (24 h)", quelle: "Gesundheitsbericht (rueckstandFehlversuchsQuote)" },
    { kennung: "W5-wartezeit", regel: "verarbeitbarer Rückstand > 24 h wächst an 3 aufeinanderfolgenden Tagen (Stufe-2-Verletzung)", quelle: "Drain-Trend (leseDrainTrendZeile)" }
  ]);
}

// Rechenprobe gegen die Realität der 5 Mandate: dasselbe Modell muss den HEUTIGEN
// gate-treuen Bedarf plausibel reproduzieren (Ist-Faktoren, kranker Personenpfad).
function rechenProbeHeute({ m = MESSWERTE } = {}) {
  const katalog = m.vorgangsAnkunftProTag - m.profilVorgaengeProTagBei5;
  const heutigeWuerdige = (katalog + m.profilVorgaengeProTagBei5 + m.personVorgaengeJeMandatIst * m.aktiveMandateBasis) * m.wuerdigAnteil;
  const bedarf = Math.ceil(heutigeWuerdige * m.aufrufeJeErgebnis * m.wiederholungsReserve);
  return { wuerdigeVorgaengeProTag: rund(heutigeWuerdige), bedarfAufrufeProTag: bedarf };
}

module.exports = {
  MESSWERTE,
  SZENARIEN,
  FREIE_KAPAZITAET_FAKTOR,
  verstehensBedarf,
  tagesModell,
  zielDeckel,
  warnSchwellen,
  rechenProbeHeute
};
