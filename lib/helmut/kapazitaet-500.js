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

// ── PASST EIN VOLLSTÄNDIGER ZYKLUS IN DAS SICHERE FENSTER? (ergänzt 02.09.) ─────────
//
// DER ANLASS (Reviewbefund, nachgerechnet): Der Abschlussbericht des
// Vorbereitungssprints nannte den Tagesdeckel 2416 und das sichere Fenster
// 263 Minuten nebeneinander, ohne sie GEGENEINANDER zu prüfen. Bei Parallelität 1
// und gemessenen 9110 ms je Aufruf passen in 263 Minuten höchstens 1732 Aufrufe —
// der konservative TAGESBEDARF (nicht der Deckel!) liegt bei 1812. Ein
// vollständiger Zyklus im konservativen Szenario passt also NICHT.
//
// Diese Funktion macht daraus eine RECHNUNG statt einer Prosa-Warnung. Sie wird
// von `funktionstest-500.startbereitschaft()` als Hürde ausgewertet: solange sie
// `passt: false` meldet, darf keine technische Startbereitschaft behauptet werden.
//
// ZWEI GRENZEN wirken zusammen, die kleinere bindet:
//   * LAUFZEIT: parallel × Fensterdauer ÷ Laufzeit je Aufruf.
//   * MINUTENGRENZE: RPM × Fensterdauer in Minuten.
// Zusätzlich ausgewiesen, weil der Motor in begrenzten Scheiben arbeitet
// (jede Route endet hart bei 280 s < maxDuration 300 s, server.js): wie viele
// Scheiben in das Fenster passen und was eine Scheibe höchstens leistet.
const SCHEIBE_MS = 280000;   // harte Grenze einer Cron-Route (server.js)

function zyklusPasstInsFenster({
  fensterMinuten = null,
  parallel = 1,
  szenario = "konservativ",
  mandate = 500,
  laufzeitJeAufrufMs = LAUFZEIT_JE_AUFRUF_MS,
  maxAnfragenJeMinute = null,
  bedarfAufrufe = null
} = {}) {
  const fenster = Number(fensterMinuten);
  const p = Math.max(1, Math.floor(Number(parallel) || 1));
  const dauer = Number(laufzeitJeAufrufMs);
  if (!Number.isFinite(fenster) || fenster <= 0 || !Number.isFinite(dauer) || dauer <= 0) {
    return Object.freeze({
      bewertbar: false,
      grund: "Fensterdauer oder Laufzeit je Aufruf fehlt — nicht bewertbar (fail closed)"
    });
  }
  // Der BEDARF, nicht der Deckel. Der Deckel ist eine Obergrenze mit 25 % Reserve;
  // ihn hier einzusetzen würde die Frage falsch stellen.
  const modell = tagesModell({ mandate, szenario });
  // KEINE KOERZIERUNG: `Number(null)` ist 0 — ein nicht uebergebener Bedarf haette
  // sonst als "0 Aufrufe noetig" gegolten und die Huerde IMMER bestanden. Genau
  // dieser Fehler ist in diesem Projekt schon zweimal aufgetreten.
  const bedarfUebergeben = typeof bedarfAufrufe === "number" && Number.isFinite(bedarfAufrufe);
  const benoetigt = bedarfUebergeben
    ? Math.max(0, Math.floor(bedarfAufrufe))
    : (modell ? modell.gesamtBedarfProTag : NaN);
  if (!Number.isFinite(benoetigt)) {
    return Object.freeze({ bewertbar: false, grund: "Bedarf nicht bestimmbar" });
  }

  const fensterMs = fenster * 60000;
  const ausLaufzeit = Math.floor(p * fensterMs / dauer);
  const ausRpm = Number.isFinite(Number(maxAnfragenJeMinute)) && Number(maxAnfragenJeMinute) > 0
    ? Math.floor(Number(maxAnfragenJeMinute) * fenster)
    : null;
  const moeglich = ausRpm === null ? ausLaufzeit : Math.min(ausLaufzeit, ausRpm);
  const scheiben = Math.floor(fensterMs / SCHEIBE_MS);
  const jeScheibe = Math.floor(p * SCHEIBE_MS / dauer);

  return Object.freeze({
    bewertbar: true,
    szenario,
    mandate,
    parallel: p,
    fensterMinuten: fenster,
    laufzeitJeAufrufMs: dauer,
    benoetigteAufrufe: benoetigt,
    moeglicheAufrufe: moeglich,
    bindendeGrenze: ausRpm !== null && ausRpm < ausLaufzeit ? "minutengrenze" : "laufzeit",
    ausLaufzeit,
    ausRpm,
    scheiben,
    aufrufeJeScheibe: jeScheibe,
    passt: moeglich >= benoetigt,
    fehlbetrag: Math.max(0, benoetigt - moeglich),
    // Wie viele Minuten bräuchte der Bedarf tatsächlich?
    benoetigteMinuten: Math.ceil(benoetigt * dauer / (p * 60000)),
    meldung: moeglich >= benoetigt
      ? `Ein vollständiger Zyklus (${szenario}, ${benoetigt} Aufrufe) passt bei Parallelität ${p} `
        + `in ${fenster} Minuten (möglich: ${moeglich}).`
      : `Ein vollständiger Zyklus (${szenario}, ${benoetigt} Aufrufe) passt bei Parallelität ${p} `
        + `NICHT in ${fenster} Minuten — möglich sind ${moeglich}, es fehlen ${benoetigt - moeglich}. `
        + `Nötig wären ${Math.ceil(benoetigt * dauer / (p * 60000))} Minuten.`
  });
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
    // EIN KONSUMENT FÜR DIE BELEGTEN MESSWERTE (adversarialer Review 02.09.):
    // `BELEGTE_MESSUNGEN` stand als dritte Wahrheit ohne Leser da. Sie wandert
    // jetzt MIT der Spanne — wer den Deckelvorschlag liest, sieht im selben
    // Objekt, was daran belegt ist und was nicht. `offeneMessungen` bleibt davon
    // UNBERÜHRT: sie wird weiterhin vollständig eingefordert.
    belegteMessungen: BELEGTE_MESSUNGEN,
    // Die physische Slotkapazität wurde berechnet, aber nie ausgewertet.
    slotKapazitaetReicht: konservativ.slotKapazitaetReicht,
    erwartung, konservativ, stress,
    heutigerDeckel: m.heutigerTagesdeckel,
    hinweis: "Vorläufiger Szenario-/Planungswert als Betreiberempfehlung — KEINE finale Dimensionierung; das Setzen von HELMUT_MAX_LLM_CALLS_PER_DAY bleibt eine freigabepflichtige Production-Änderung und braucht zuvor die offenen Messungen (offeneMessungen)."
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// BELEGTE MESSUNGEN UND DER VORBEREITETE, NICHT GESETZTE BETREIBERWERT
// (ergänzt 2026-09-02 — Vorbereitungssprint vor dem 500er-Funktionstest)
// ═════════════════════════════════════════════════════════════════════════════
//
// WAS SICH GEÄNDERT HAT. `zielDeckel().offeneMessungen` führte fünf Messungen,
// die eine VERBINDLICHE Deckelfestlegung blockieren. Vier davon sind seit dem
// 01.09. tatsächlich ERHOBEN (Azure-Messpakete und die korrigierte
// Telemetriequelle `helmut_store.data.llmUsage`, Beleg
// docs/betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md §16). Sie
// standen bisher nur in der Doku und mussten von jedem Aufrufer von Hand
// beigebracht werden — eine zweite Wahrheit an einer zweiten Stelle.
//
// WAS SICH NICHT ÄNDERT. `offeneMessungen` bleibt UNVERÄNDERT die Liste, die
// `pruefeKonfiguration()` einfordert: der Betreiber trägt sie weiterhin
// ausdrücklich bei, sie wird nicht stillschweigend als erledigt gewertet. Und
// es wird KEIN Deckel gesetzt: `HELMUT_MAX_LLM_CALLS_PER_DAY` und
// `HELMUT_LLM_RESERVE_UNDERSTANDING` bleiben unberührt (CLAUDE.md §5).
//
// EINE EINSCHRÄNKUNG BLEIBT BEWUSST OFFEN: `azure-kontingente-und-rate-limits`
// ist nur TEILWEISE belegt. Bestätigt sind die DEPLOYMENTGRENZEN (250.000 TPM /
// 250 RPM für `gpt-5-mini`, Global Standard, Version 2025-08-07, Sweden
// Central, Betreiberangabe 02.09.); das GESAMTKONTINGENT DES AZURE-KONTOS ist
// davon getrennt und wurde nie erhoben. Aus der Deploymentgrenze folgt KEINE
// Aussage über das Konto — deshalb steht diese Messung hier als `teilweise`
// und NICHT als belegt.
const BELEGTE_MESSUNGEN = Object.freeze({
  "p95-tagesbedarf-verstehen": Object.freeze({
    belegt: true, wert: 82, einheit: "KI-Aufrufe/Tag",
    herkunft: "helmut_store.data.llmUsage, 60 volle Tage 2026-07-03 bis 2026-08-31 (§16.3)",
    einschraenkung: "UNTERGRENZE — der Blob-Ring untererfasst nachweislich (§17.2)."
  }),
  "p95-tagesbedarf-lage": Object.freeze({
    belegt: true, wert: 7, einheit: "KI-Aufrufe/Tag",
    herkunft: "dieselbe Messreihe (§16.3, K2: 238 lageBriefing-Aufrufe, 230 erfolgreich)",
    einschraenkung: "UNTERGRENZE, siehe oben."
  }),
  "p95-tagesbedarf-buero": Object.freeze({
    belegt: true, wert: 24, einheit: "KI-Aufrufe/Tag",
    herkunft: "dieselbe Messreihe (§16.3, K1: 390 communicationDraft-Aufrufe)",
    einschraenkung: "UNTERGRENZE, siehe oben."
  }),
  "azure-kontingente-und-rate-limits": Object.freeze({
    belegt: false, wert: null, einheit: null,
    herkunft: "Deploymentgrenze bestätigt (Betreiber 02.09.): 250.000 TPM / 250 RPM, "
      + "gpt-5-mini, Global Standard, Version 2025-08-07, Sweden Central (§17.5). "
      + "Eigene Messung lastete sie zu 13,1 % / 4,3 % aus (§16.1).",
    einschraenkung: "TEILWEISE — das Azure-GESAMTKONTINGENT DES KONTOS ist getrennt "
      + "und wurde nicht erhoben (nur Portal/ARM sichtbar). Deshalb NICHT belegt."
  }),
  "vollstaendiger-fachwegbericht": Object.freeze({
    belegt: true, wert: null, einheit: null,
    herkunft: "alle drei Arbeitsformen gemessen (Verstehen, Lage, Büro) — §16.1 und §16.3",
    einschraenkung: "Der synthetische Büro-Prompt der Stichprobe war zu klein "
      + "(451 statt 1.372 Eingabetoken); für Büro gelten die Production-Werte (§16.1)."
  })
});

// Gemessene Kosten je Aufruf (Listenpreis 0,25/2,00 USD je Mio. Token, §16.5).
// F7 BLEIBT OFFEN: das ist der öffentliche Listenpreis, KEIN nachgewiesener
// Kontopreis. Jede Zahl darunter ist eine Listenpreis-Rechnung.
//
// EHRLICHE EINORDNUNG des Mischwerts (adversarialer Review 02.09.): 0,002941 ist
// der IST-Mix der heutigen fünf Mandate (rund 82 % Verstehen). Bei 500 Profilen
// verschiebt sich der Mix zugunsten der mandatsgebundenen Arbeit — die ist
// BILLIGER. Der Mischwert ist damit für den Testtag eher zu hoch als zu
// niedrig; die obere Schranke (alles Verstehen) bleibt die bindende Zahl.
const KOSTEN_JE_AUFRUF_USD = Object.freeze({
  verstehen: 0.003355,
  lage: 0.001266,
  buero: 0.000913,
  gemischt: 0.002941
});

// Gemessene Token je Aufruf (Stichprobe 01.09.: 52.094 Eingabe + 11.291 Ausgabe
// auf 21 Aufrufe = 3.018,3). Diese Zahl ist der Grund, warum die RPM-Grenze des
// Deployments (250) für den Testlauf NICHT die wirksame Grenze ist.
const TOKEN_JE_AUFRUF = Math.round((52094 + 11291) / 21);   // 3018

// Gemessene Laufzeit je Aufruf, Median der langsamsten Arbeitsform
// (Verstehen 9.110 ms, §16.1). Konservativ: die langsamste Form bestimmt den
// erreichbaren Durchsatz bei Parallelität 1.
const LAUFZEIT_JE_AUFRUF_MS = 9110;

// Die WIRKSAME Minutengrenze des Testlaufs. Belegter Befund (adversarialer
// Review 02.09.): 250 Anfragen/Minute × 3.018 Token = 754.500 Token/Minute — das
// Dreifache der TPM-Grenze. Wer 250 als Testgrenze setzt, setzt eine Grenze, die
// die andere Grenze bricht. Bindend ist der kleinere der beiden Werte.
function wirksameRpm({ rpmGrenze = 250, tpmGrenze = 250000, tokenJeAufruf = TOKEN_JE_AUFRUF } = {}) {
  const ausTpm = Math.floor(Number(tpmGrenze) / Math.max(1, Number(tokenJeAufruf)));
  const wirksam = Math.min(Math.floor(Number(rpmGrenze)), ausTpm);
  return Object.freeze({
    rpmGrenze: Math.floor(Number(rpmGrenze)),
    tpmGrenze: Math.floor(Number(tpmGrenze)),
    tokenJeAufruf: Math.max(1, Math.floor(Number(tokenJeAufruf))),
    ausTpm,
    wirksam,
    bindend: ausTpm < Math.floor(Number(rpmGrenze)) ? "tpm" : "rpm",
    hinweis: `Bei ${tokenJeAufruf} Token je Aufruf erlaubt die TPM-Grenze nur ${ausTpm} `
      + `Anfragen/Minute — die RPM-Grenze ${rpmGrenze} ist dann nicht die wirksame Grenze.`
  });
}

// Der belegt gestützte VORSCHLAG. Er wird hier NICHT gesetzt und NICHT
// aktiviert — er ist die eine kanonische Stelle, an der die später zu setzenden
// Werte samt Herkunft und Kostenfolge stehen.
const VORBEREITETER_DECKEL = 2416;
const VORBEREITETE_RESERVE_VERSTEHEN = 702;
// Vorrangreserve der realen Mandate: der gemessene p95-Tagesbedarf ist 170 und
// eine Untergrenze; empfohlen wird 200 (Aufschlag für die bewiesene ~12 %
// Untererfassung, konservativ aufgerundet). Kanonisch in `mandatsklasse.js`.

// Die harte Kostenabbruchgrenze, konservativ hergeleitet.
//
// Die Zahl der Aufrufe ist durch den Deckel hart begrenzt — die Kosten können
// deshalb nur so hoch werden wie Deckel × Preis je Aufruf:
//   Erwartung (gemischt)          2.416 × 0,002941 = 7,11 USD/Tag
//   obere Schranke (nur Verstehen) 2.416 × 0,003355 = 8,11 USD/Tag
// Die Abbruchgrenze liegt bewusst ÜBER der oberen Schranke: sie soll nicht durch
// normale Streuung auslösen, sondern ein Weglaufen fangen. Gewählt: 10,00 USD.
//
// EHRLICHE GRENZE DIESER ZAHL (F7): sie ist am LISTENPREIS gerechnet. Liegt der
// Kontopreis höher, unterschätzt die laufende Kostenrechnung die echten Kosten
// im selben Verhältnis — die Grenze griffe dann zu spät. Was das Risiko
// begrenzt, ist NICHT diese Grenze, sondern der Aufrufdeckel selbst: mehr als
// 2.416 Aufrufe kann der Tag nicht kosten, egal zu welchem Preis.
function kostenabbruchgrenze({ deckel = VORBEREITETER_DECKEL, k = KOSTEN_JE_AUFRUF_USD } = {}) {
  const d = Math.max(0, Math.floor(Number(deckel) || 0));
  const erwartung = d * k.gemischt;
  const obereSchranke = d * k.verstehen;
  // Auf volle 0,50 USD über der oberen Schranke aufrunden, mindestens +20 %.
  const roh = Math.max(obereSchranke * 1.2, obereSchranke + 0.5);
  const empfehlung = Math.ceil(roh * 2) / 2;
  return Object.freeze({
    deckel: d,
    erwartungUsdProTag: Math.round(erwartung * 100) / 100,
    obereSchrankeUsdProTag: Math.round(obereSchranke * 100) / 100,
    empfehlungUsd: empfehlung,
    env: "HELMUT_TESTLAUF_KOSTENBUDGET_USD",
    monatErwartungUsd: Math.round(erwartung * 30),
    monatObereSchrankeUsd: Math.round(obereSchranke * 30),
    preisbasis: "Listenpreis 0,25/2,00 USD je Mio. Token (F7: kein nachgewiesener Kontopreis)",
    hinweis: "Die Grenze ist am Listenpreis gerechnet. Ein höherer Kontopreis würde die "
      + "laufende Rechnung im selben Verhältnis unterschätzen; begrenzend ist dann allein "
      + "der Aufrufdeckel."
  });
}

// Alles, was der Betreiber später setzen muss — an EINER Stelle, mit Herkunft.
// Diese Funktion SETZT NICHTS. Sie beschreibt.
function vorbereiteteBetreiberwerte({ mandate = 500 } = {}) {
  const kosten = kostenabbruchgrenze({ deckel: VORBEREITETER_DECKEL });
  const rpm = wirksameRpm();
  // Erreichbarkeit bei Parallelität 1: wie lange braucht der Deckel überhaupt?
  const minutenBeiParallel1 = Math.ceil((VORBEREITETER_DECKEL * LAUFZEIT_JE_AUFRUF_MS) / 60000);
  return Object.freeze({
    gesetzt: false,
    hinweis: "VORBEREITET, NICHT GESETZT. Jeder dieser Werte ist eine eigene, "
      + "ausdrückliche Betreiberfreigabe (CLAUDE.md §5). Dieser Code liest sie nur.",
    werte: Object.freeze([
      Object.freeze({
        env: "HELMUT_MAX_LLM_CALLS_PER_DAY", wert: VORBEREITETER_DECKEL,
        herkunft: `konservatives Szenario ÷ 0,75; Fairness-Untergrenze 2n−1 = ${2 * mandate - 1}; `
          + "gemessener Boden 1.496/Tag, 0,3 % neben dem Szenariowert 1.492 (§16.4)",
        offen: "Verstehenswachstum bei 500 Mandaten (geteiltes Korpus) — größte Restunsicherheit"
      }),
      Object.freeze({
        env: "HELMUT_LLM_RESERVE_UNDERSTANDING", wert: VORBEREITETE_RESERVE_VERSTEHEN,
        herkunft: "konservativer priorisierter Frischbedarf; die Reserve liegt IM Deckel "
          + "und wird NIE addiert (gestützt durch p95 Verstehen 82/Tag bei 5 Mandaten)",
        offen: "dasselbe Wachstum"
      }),
      Object.freeze({
        env: "HELMUT_TESTLAUF_VORRANG_REAL", wert: 200,
        herkunft: "gemessener p95-Tagesbedarf der 5 realen Mandate = 170 (UNTERGRENZE, §16.3) "
          + "plus Aufschlag für die bewiesene ~12 % Untererfassung (§17.2)",
        offen: "Aufteilung je Mandat (der Bedarf ist nicht je Mandat aufgeschlüsselt)"
      }),
      Object.freeze({
        env: "HELMUT_TESTLAUF_MAX_RPM", wert: rpm.wirksam,
        herkunft: `NICHT die Deploymentgrenze 250, sondern der WIRKSAME Wert: bei gemessenen `
          + `${rpm.tokenJeAufruf} Token je Aufruf lässt die TPM-Grenze ${rpm.tpmGrenze} nur `
          + `${rpm.ausTpm} Anfragen/Minute zu (bindend: ${rpm.bindend}). 250 zu setzen hieße, `
          + "eine Grenze zu setzen, welche die andere bricht.",
        offen: "Azure-GESAMTKONTINGENT DES KONTOS — nicht erhoben"
      }),
      Object.freeze({
        env: "HELMUT_TESTLAUF_MAX_TPM", wert: 250000,
        herkunft: "Deploymentgrenze (Betreiber 02.09.); eigene Messung 13,1 %",
        offen: "dasselbe Gesamtkontingent"
      }),
      Object.freeze({
        env: kosten.env, wert: kosten.empfehlungUsd,
        herkunft: `Deckel ${kosten.deckel} × Preis je Aufruf: Erwartung `
          + `${kosten.erwartungUsdProTag} USD/Tag, obere Schranke ${kosten.obereSchrankeUsdProTag} USD/Tag`,
        offen: "F7 — nur Listenpreis, kein nachgewiesener Kontopreis"
      }),
      Object.freeze({
        env: "HELMUT_TESTLAUF_MAX_PARALLEL", wert: 1,
        herkunft: `HELMUT_VERSTEHEN_PARALLELITAET ist ungesetzt und wirkt als 1. Bei gemessenen `
          + `${LAUFZEIT_JE_AUFRUF_MS} ms je Aufruf braucht der Deckel ${VORBEREITETER_DECKEL} damit `
          + `mindestens ${minutenBeiParallel1} Minuten reiner Laufzeit`,
        offen: null
      })
    ]),
    kosten,
    minutengrenze: rpm,
    erreichbarkeit: Object.freeze({
      laufzeitJeAufrufMs: LAUFZEIT_JE_AUFRUF_MS,
      mindestLaufzeitMinutenBeiParallel1: minutenBeiParallel1,
      hinweis: "Der Deckel ist nur erreichbar, wenn das gewählte Startfenster mindestens "
        + "diese Laufzeit trägt. Das längste tagsüber freie Fenster ist 263 Minuten."
    })
  });
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

// ── DIE LASTTRENNUNG (Betreiberauftrag 02.09., Punkt 11) ────────────────────
//
// Der Tagesbedarf ist EINE Zahl, aber DREI verschiedene Dinge. Sie zu vermengen
// war die Ursache eines zurueckgenommenen Befundes (Sicherheitsrahmen §29):
//
//   1. WARTESCHLANGENARBEIT — was der Fachzyklus ueber `/api/cron/pipeline`
//      tatsaechlich erzeugt. Von den fuenf Auftragstypen der Warteschlange traegt
//      genau EINER Modellaufrufe: `document_understanding` (geteilt, mandanten-
//      unabhaengig). `source_fetch`, `mandate_projection` und
//      `briefing_materialization` sind KI-frei (scalable-pipeline.js:1113/:1175);
//      `tenant_narrative` traegt KI, ist aber per Flag und nicht angewendeter
//      Migration AUS.
//   2. NUTZERGETRIEBENE AUFRUFE — `communicationDraft` (POST
//      /api/communication/generate), `parliamentAssessment`, `helmutAssessment`,
//      `refineBriefingItem`, `office-output` sowie `lageBriefing` ueber den
//      eigenen 05:45-Cron. Der Fachzyklus erzeugt davon NICHTS. Sie koennen aber
//      JEDERZEIT anfallen und zehren vom SELBEN Tagesdeckel.
//   3. BUDGETRESERVE — was der Deckel darueber hinaus vorhalten muss.
//
// WICHTIG: Diese Funktion ist BESCHREIBEND. Sie liefert bewusst KEINE neue
// Fenstergroesse und wird von keiner Huerde als Bedarf eingesetzt. Genau dieser
// Kurzschluss ("dann sind es eben nur 812") ist am 02.09. zurueckgenommen worden:
// die nutzergetriebene Last verschwindet nicht dadurch, dass der Zyklus sie nicht
// erzeugt — sie konkurriert um denselben Deckel.
function lastTrennung({ mandate = 500, szenario = "konservativ" } = {}) {
  const m = tagesModell({ mandate, szenario });
  if (!m) return Object.freeze({ bewertbar: false, grund: `Unbekanntes Szenario: ${szenario}` });
  const warteschlange = m.verstehen.aufrufeProTag + m.rueckstandsAbbauProTag;
  const nutzerUndEigeneCrons = m.mandatsgebundenProTag;
  const andere = m.andereVerbraucherProTag;
  const gesamt = m.gesamtBedarfProTag;
  return Object.freeze({
    bewertbar: true,
    szenario, mandate,
    gesamtBedarfProTag: gesamt,
    // (1) Was der Fachzyklus im Fenster erzeugt.
    warteschlangenarbeitProTag: warteschlange,
    warteschlangenanteil: Math.round(warteschlange / gesamt * 10000) / 10000,
    kiFreieWarteschlangenklassen: Object.freeze([
      "source_fetch", "mandate_projection", "briefing_materialization"
    ]),
    kiTragendeWarteschlangenklasse: "document_understanding",
    // (2) Was NUR durch Nutzeraktionen oder eigene Crons entsteht.
    nutzergetriebenUndEigeneCronsProTag: nutzerUndEigeneCrons,
    nutzeranteil: Math.round(nutzerUndEigeneCrons / gesamt * 10000) / 10000,
    nutzerpfade: Object.freeze([
      "communicationDraft (POST /api/communication/generate)",
      "lageBriefing (Cron 05:45 UTC und GET /api/lage/briefing)",
      "parliamentAssessment", "helmutAssessment", "refineBriefingItem", "office-output"
    ]),
    andereVerbraucherProTag: andere,
    // (3) Reserve im Deckel.
    erforderlicherDeckel: m.erforderlicherDeckel,
    budgetreserveProTag: Math.max(0, m.erforderlicherDeckel - gesamt),
    hinweis: "BESCHREIBEND. Die Warteschlangenzahl ist KEINE Fenstergroesse: die "
      + "nutzergetriebene Last kann gleichzeitig anfallen und zehrt vom selben Tagesdeckel."
  });
}

module.exports = {
  SCHEIBE_MS,
  lastTrennung,
  zyklusPasstInsFenster,
  MESSWERTE,
  SZENARIEN,
  BELEGTE_MESSUNGEN,
  KOSTEN_JE_AUFRUF_USD,
  VORBEREITETER_DECKEL,
  VORBEREITETE_RESERVE_VERSTEHEN,
  TOKEN_JE_AUFRUF,
  LAUFZEIT_JE_AUFRUF_MS,
  wirksameRpm,
  kostenabbruchgrenze,
  vorbereiteteBetreiberwerte,
  FREIE_KAPAZITAET_FAKTOR,
  verstehensBedarf,
  tagesModell,
  zielDeckel,
  warnSchwellen,
  rechenProbeHeute
};
