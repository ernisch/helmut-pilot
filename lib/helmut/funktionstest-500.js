"use strict";

// Helmut — SICHERHEITSRAHMEN DES 500er-PRODUCTION-FUNKTIONSTESTS.
// =============================================================================
// Drei Teile, alle FAIL CLOSED und alle ohne jede Production-Wirkung:
//
//   A. KAPAZITÄTS- UND KOSTENRIEGEL  — sieben Pflichtwerte, ihre Validierung
//      und ihre gegenseitige Bindung. Es wird KEIN Production-Wert gesetzt;
//      dieses Modul prüft nur, ob eine übergebene Konfiguration in sich
//      stimmig und vollständig ist.
//   B. ABBRUCHREGELN — zwölf Regeln, die den späteren Lauf automatisch
//      stoppen. Eine Regel ohne Messwert ist NICHT „grün", sondern
//      „nicht bewertbar" — und das bricht ab.
//   C. STARTFENSTER — der Test darf nicht in ein unverträgliches Laufzeit-
//      fenster gelegt werden (05:45-Lage-Briefing und 05:48-Minimal-Cron-Slot).
//
// Reine Logik: kein Netz, keine Datenbank, keine Uhr, keine Secrets. Alle
// Eingaben sind Parameter. Nichts hier aktiviert, setzt oder ändert etwas.
//
// ─── WARUM KEIN KONKRETER PRODUCTION-WERT ────────────────────────────────────
// Die dokumentierte Spanne 1.492–2.416 Aufrufe/Tag sind SZENARIEN aus
// `lib/helmut/kapazitaet-500.js` (Erwartung bzw. konservativ), kein finaler
// Deckel. Die verbindliche Festlegung braucht zuvor die offenen Z3b-Messungen
// (`zielDeckel().offeneMessungen`). Dieses Modul gibt deshalb eine
// EMPFEHLUNG mit Herkunft und Einordnung aus und verweigert die Bereitschaft,
// solange eine Pflichtangabe oder eine offene Messung fehlt.

const kapazitaet = require("./kapazitaet-500");
const minimalCron = require("./minimal-cron");
const kommunikationsriegel = require("./kommunikationsriegel");
const { KOHORTE_GESAMT, REALE_MANDATE } = require("./test-kohorte-500");

const MANDATE_GESAMT = REALE_MANDATE + KOHORTE_GESAMT; // 500

// ═════════════════════════════════════════════════════════════════════════════
// A · KAPAZITÄTS- UND KOSTENRIEGEL
// ═════════════════════════════════════════════════════════════════════════════

// Die sieben Pflichtwerte. Jeder trägt seinen Umgebungsnamen, seine Einheit und
// die Begründung, warum er ohne Wert blockiert.
const PFLICHTWERTE = Object.freeze([
  Object.freeze({
    schluessel: "gesamtdeckel",
    env: "HELMUT_MAX_LLM_CALLS_PER_DAY",
    einheit: "KI-Aufrufe/Tag",
    art: "ganzzahl",
    zweck: "Sicherer Gesamtdeckel aller KI-Aufrufe des Tages (bindende Obergrenze).",
    ohneWert: "Ohne gesetzten Deckel greift laut Code das Schutzlimit 50 — für 500 Mandate ist das kein Testlauf, sondern ein sofortiger Budgetboden."
  }),
  Object.freeze({
    schluessel: "reserveVerstehen",
    env: "HELMUT_LLM_RESERVE_UNDERSTANDING",
    einheit: "KI-Aufrufe/Tag",
    art: "ganzzahl",
    zweck: "Anteil INNERHALB des Gesamtdeckels, der dem Frischverstehen vorbehalten bleibt.",
    ohneWert: "Ohne passende Reserve verhungert das Frischverstehen unter dem neuen Deckel — die Reserve wird nie zum Deckel addiert."
  }),
  Object.freeze({
    schluessel: "maxAnfragenJeMinute",
    env: "HELMUT_TESTLAUF_MAX_RPM",
    einheit: "Anfragen/Minute",
    art: "ganzzahl",
    zweck: "Harte Minutengrenze gegen die Anbieter-Drosselung (Azure RPM).",
    ohneWert: "Ohne RPM-Grenze läuft der Test blind in die Anbieterdrosselung."
  }),
  Object.freeze({
    schluessel: "maxTokenJeMinute",
    env: "HELMUT_TESTLAUF_MAX_TPM",
    einheit: "Token/Minute",
    art: "ganzzahl",
    zweck: "Harte Minutengrenze des Tokendurchsatzes (Azure TPM).",
    ohneWert: "Ohne TPM-Grenze kann eine einzige lange Antwort das Minutenkontingent reißen."
  }),
  Object.freeze({
    schluessel: "kostenbudgetUsd",
    env: "HELMUT_TESTLAUF_KOSTENBUDGET_USD",
    einheit: "USD",
    art: "dezimal",
    zweck: "Maximale Kosten des gesamten Funktionstests.",
    ohneWert: "Ohne Kostenbudget gibt es keine Grenze, gegen die Abbruchregel 4 prüfen könnte."
  }),
  Object.freeze({
    schluessel: "vorrangreserveReal",
    env: "HELMUT_TESTLAUF_VORRANG_REAL",
    einheit: "KI-Aufrufe/Tag",
    art: "ganzzahl",
    zweck: `Innerhalb des Deckels freigehaltener Vorrang für die ${REALE_MANDATE} realen Mandate.`,
    ohneWert: "Ohne Vorrangreserve können 495 synthetische Profile die realen Mandate aus dem Tagesbudget verdrängen."
  }),
  Object.freeze({
    schluessel: "maxParallel",
    env: "HELMUT_TESTLAUF_MAX_PARALLEL",
    einheit: "gleichzeitige Aufrufe",
    art: "ganzzahl",
    zweck: "Harte Begrenzung gleichzeitiger Modellaufrufe.",
    ohneWert: "Ohne Parallelitätsgrenze ist weder die RPM- noch die TPM-Grenze einhaltbar."
  })
]);

// Fairness-Untergrenze K1: bei n Mandaten braucht der Deckel mindestens 2n−1
// Aufrufe, damit kein Mandat strukturell leer ausgeht.
function fairnessUntergrenze(mandate = MANDATE_GESAMT) {
  return 2 * mandate - 1;
}

function istGanzzahl(wert) {
  return typeof wert === "number" && Number.isSafeInteger(wert) && wert > 0;
}
function istDezimal(wert) {
  return typeof wert === "number" && Number.isFinite(wert) && wert > 0;
}

// Prüft eine übergebene Konfiguration. Wirft nie; antwortet immer vollständig.
// `bereit` ist NUR true, wenn alle sieben Werte gesetzt, alle Bindungen erfüllt
// UND alle offenen Messungen beigebracht sind.
function pruefeKonfiguration(konfiguration = {}, { mandate = MANDATE_GESAMT, messungen = {} } = {}) {
  const werte = konfiguration && typeof konfiguration === "object" ? konfiguration : {};
  const fehlend = [];
  const gelesen = {};

  for (const feld of PFLICHTWERTE) {
    const roh = werte[feld.schluessel];
    const gueltig = feld.art === "dezimal" ? istDezimal(roh) : istGanzzahl(roh);
    if (!gueltig) {
      fehlend.push(Object.freeze({
        schluessel: feld.schluessel,
        env: feld.env,
        einheit: feld.einheit,
        wirkung: feld.ohneWert
      }));
      continue;
    }
    gelesen[feld.schluessel] = roh;
  }

  const bindungen = [];
  const untergrenze = fairnessUntergrenze(mandate);
  const habe = (k) => Object.prototype.hasOwnProperty.call(gelesen, k);

  if (habe("gesamtdeckel")) {
    bindungen.push({
      name: "Deckel erreicht die Fairness-Untergrenze 2n−1",
      ok: gelesen.gesamtdeckel >= untergrenze,
      detail: `Deckel ${gelesen.gesamtdeckel} gegen Untergrenze ${untergrenze} bei ${mandate} Mandaten`
    });
  }
  if (habe("gesamtdeckel") && habe("reserveVerstehen")) {
    bindungen.push({
      name: "Verstehens-Reserve liegt IM Deckel und wird nie addiert",
      ok: gelesen.reserveVerstehen < gelesen.gesamtdeckel,
      detail: `Reserve ${gelesen.reserveVerstehen} < Deckel ${gelesen.gesamtdeckel}`
    });
  }
  if (habe("gesamtdeckel") && habe("reserveVerstehen") && habe("vorrangreserveReal")) {
    const summe = gelesen.reserveVerstehen + gelesen.vorrangreserveReal;
    bindungen.push({
      name: "Beide Reserven zusammen passen in den Deckel",
      ok: summe < gelesen.gesamtdeckel,
      detail: `Verstehen ${gelesen.reserveVerstehen} + Vorrang real ${gelesen.vorrangreserveReal} = ${summe} < ${gelesen.gesamtdeckel}`
    });
  }
  if (habe("vorrangreserveReal")) {
    bindungen.push({
      name: `Vorrangreserve deckt die ${REALE_MANDATE} realen Mandate`,
      ok: gelesen.vorrangreserveReal >= REALE_MANDATE,
      detail: `Vorrang ${gelesen.vorrangreserveReal} für ${REALE_MANDATE} reale Mandate`
    });
  }
  if (habe("maxParallel") && habe("maxAnfragenJeMinute")) {
    bindungen.push({
      name: "Parallelität überschreitet die Minutengrenze nicht",
      ok: gelesen.maxParallel <= gelesen.maxAnfragenJeMinute,
      detail: `parallel ${gelesen.maxParallel} ≤ RPM ${gelesen.maxAnfragenJeMinute}`
    });
  }
  if (habe("gesamtdeckel") && habe("maxAnfragenJeMinute")) {
    // Der Deckel muss an einem Tag überhaupt durch die Minutengrenze passen.
    const maxProTag = gelesen.maxAnfragenJeMinute * 60 * 24;
    bindungen.push({
      name: "Der Tagesdeckel ist mit der RPM-Grenze überhaupt erreichbar",
      ok: gelesen.gesamtdeckel <= maxProTag,
      detail: `Deckel ${gelesen.gesamtdeckel} ≤ RPM-Tageskapazität ${maxProTag}`
    });
  }

  const gebrochen = bindungen.filter((b) => !b.ok);

  // Offene externe Messungen: ohne sie ist keine VERBINDLICHE Dimensionierung
  // möglich — insbesondere ist die TPM-Grenze nicht gegen echte Tokenwerte
  // prüfbar, solange die Azure-Messung fehlt.
  const empfehlung = kapazitaet.zielDeckel({ mandate });
  const offeneMessungen = empfehlung.offeneMessungen.filter(
    (name) => !(messungen && messungen[name])
  );

  const bereit = fehlend.length === 0 && gebrochen.length === 0 && offeneMessungen.length === 0;
  return Object.freeze({
    bereit,
    mandate,
    fehlendeWerte: Object.freeze(fehlend),
    bindungen: Object.freeze(bindungen.map((b) => Object.freeze({ ...b }))),
    gebrocheneBindungen: Object.freeze(gebrochen.map((b) => b.name)),
    offeneMessungen: Object.freeze(offeneMessungen),
    fairnessUntergrenze: untergrenze,
    empfehlung: entscheidungstabelle({ mandate }),
    meldung: bereit
      ? "Konfiguration vollständig, in sich stimmig und durch Messungen belegt."
      : `Konfiguration NICHT bereit: ${fehlend.length} fehlende Werte, `
        + `${gebrochen.length} gebrochene Bindungen, ${offeneMessungen.length} offene Messungen.`
  });
}

// Die belegte Entscheidungstabelle: empfohlene Werte MIT Herkunft, offene
// Messwerte und das Verhalten bei fehlendem Pflichtwert. Ausdrücklich KEINE
// Production-Werte — die Spanne bleibt als Spanne stehen.
function entscheidungstabelle({ mandate = MANDATE_GESAMT } = {}) {
  const ziel = kapazitaet.zielDeckel({ mandate });
  const untergrenze = fairnessUntergrenze(mandate);
  return Object.freeze({
    einordnung: ziel.einordnung, // "vorlaeufiger-szenario-planungswert"
    warnung: "Die Werte 1.492 (Erwartung) bis 2.416 (konservativ) sind SZENARIEN, "
      + "kein finaler Production-Deckel. Die verbindliche Festlegung braucht zuvor "
      + "die offenen Messungen und bleibt eine getrennte Betreiberfreigabe.",
    zeilen: Object.freeze([
      Object.freeze({
        wert: "gesamtdeckel",
        env: "HELMUT_MAX_LLM_CALLS_PER_DAY",
        empfehlung: `${ziel.spanne.erwartung}–${ziel.spanne.konservativ} (Szenariospanne)`,
        herkunft: "kapazitaet-500.zielDeckel(): konservativer Bedarf ÷ 0,75; Fairness-Untergrenze 2n−1",
        untergrenze,
        offen: "p95-Tagesbedarfe je Fachweg, echte Azure-Kontingente",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "reserveVerstehen",
        env: "HELMUT_LLM_RESERVE_UNDERSTANDING",
        empfehlung: `${ziel.reserveVerstehen} (Anteil IM Deckel)`,
        herkunft: "kapazitaet-500: konservativer priorisierter Verstehens-Frischbedarf",
        untergrenze: null,
        offen: "p95-Tagesbedarf Verstehen",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "maxAnfragenJeMinute",
        env: "HELMUT_TESTLAUF_MAX_RPM",
        empfehlung: "OFFEN — aus dem Azure-Kontingent des Deployments abzuleiten",
        herkunft: "Azure-Portal (rein lesend), Z3b-Messplan §Preisgrundlage",
        untergrenze: null,
        offen: "azure-kontingente-und-rate-limits",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "maxTokenJeMinute",
        env: "HELMUT_TESTLAUF_MAX_TPM",
        empfehlung: "OFFEN — erst nach der 21er-Stichprobe belegbar",
        herkunft: "Z3b-Azure-Stichprobe: p95 Eingabe-/Ausgabetoken je Arbeitsform",
        untergrenze: null,
        offen: "azure-kontingente-und-rate-limits, p95-Tagesbedarf je Fachweg",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "kostenbudgetUsd",
        env: "HELMUT_TESTLAUF_KOSTENBUDGET_USD",
        empfehlung: "OFFEN — Deckel × gemessene Kosten je Aufruf; Preisbasis F7 ist unbelegt",
        herkunft: "Z3b-Azure-Stichprobe + am Lauftag bestätigter Kontopreis",
        untergrenze: null,
        offen: "azure-preis-am-lauftag",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "vorrangreserveReal",
        env: "HELMUT_TESTLAUF_VORRANG_REAL",
        empfehlung: `mindestens ${REALE_MANDATE} — die realen Mandate dürfen nie verdrängt werden`,
        herkunft: "Betriebsentscheidung; Untergrenze aus der Zahl realer Mandate",
        untergrenze: REALE_MANDATE,
        offen: "tatsächlicher Tagesbedarf der realen Mandate (p95)",
        beiFehlendemWert: "fail closed — kein Testbeginn"
      }),
      Object.freeze({
        wert: "maxParallel",
        env: "HELMUT_TESTLAUF_MAX_PARALLEL",
        empfehlung: "1 (unveränderte Parallelität des heutigen Motors)",
        herkunft: "HELMUT_VERSTEHEN_PARALLELITAET ist ungesetzt und wirkt als 1",
        untergrenze: 1,
        offen: null,
        beiFehlendemWert: "fail closed — kein Testbeginn"
      })
    ]),
    offeneMessungen: ziel.offeneMessungen,
    failClosed: "Solange EIN Pflichtwert fehlt oder EINE offene Messung aussteht, "
      + "meldet pruefeKonfiguration() bereit=false und der Test darf nicht beginnen."
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// B · ABBRUCHREGELN
// ═════════════════════════════════════════════════════════════════════════════
//
// Jede Regel nennt ihre Beobachtungsgröße und ihre Grenze. Eine Regel, deren
// Beobachtung fehlt, ist NICHT erfüllt, sondern NICHT BEWERTBAR — und das
// bricht den Lauf ab. „Kein Messwert" darf nie wie „alles in Ordnung" wirken.

const ABBRUCHREGELN = Object.freeze([
  Object.freeze({
    id: "A01", name: "Erster unbekannter Modellaufruf",
    beobachtung: "unbekannteModellaufrufe", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "llm_usage / Laufquittung (callType-Allowlist)",
    beschreibung: "Ein Modellaufruf, dessen Arbeitsform nicht im freigegebenen Katalog steht."
  }),
  Object.freeze({
    id: "A02", name: "Hängende oder verlorene Lease",
    beobachtung: "haengendeLeases", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "helmut_jobs / CAS-Leases (abgelaufene oder verwaiste Reservierung)",
    beschreibung: "Eine Reservierung ohne lebenden Bearbeiter — Doppelarbeit oder Verlust droht."
  }),
  Object.freeze({
    id: "A03", name: "Fehlerquote über der Grenze",
    beobachtung: "fehlerquote", grenzeSchluessel: "maxFehlerquote", grenzeFest: null,
    quelle: "Laufbilanz (fehlgeschlagen ÷ verarbeitet)",
    beschreibung: "Anteil endgültig fehlgeschlagener Vorgänge überschreitet die gesetzte Grenze."
  }),
  Object.freeze({
    id: "A04", name: "Kostenüberschreitung",
    beobachtung: "kostenBisherUsd", grenzeSchluessel: "kostenbudgetUsd", grenzeFest: null,
    quelle: "Kostenrechnung aus llm_budget_counters × bestätigtem Preis",
    beschreibung: "Die laufende Kostenoberrechnung erreicht das freigegebene Budget."
  }),
  Object.freeze({
    id: "A05", name: "Laufzeitüberschreitung",
    beobachtung: "laufzeitMinuten", grenzeSchluessel: "maxLaufzeitMinuten", grenzeFest: null,
    quelle: "Startzeitpunkt des Tests gegen die Uhr des Aufrufers",
    beschreibung: "Der Test überschreitet sein vereinbartes Zeitfenster."
  }),
  Object.freeze({
    id: "A06", name: "Azure-Drosselung",
    beobachtung: "drosselungen", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "HTTP 429 des Anbieters",
    beschreibung: "Schon die erste Drosselung beendet den Lauf — kein Wiederholungsversuch."
  }),
  Object.freeze({
    id: "A07", name: "Wachsender fälliger Rückstand",
    beobachtung: "rueckstandWachstum", grenzeSchluessel: "maxRueckstandWachstum", grenzeFest: null,
    quelle: "Drain-Bilanz (Ankunft − Abfluss der gate-würdigen Vorgänge)",
    beschreibung: "Der fällige Rückstand wächst stärker als zugelassen — der Motor kommt nicht nach."
  }),
  Object.freeze({
    id: "A08", name: "Unvollständige Bilanz",
    beobachtung: "bilanzVollstaendig", grenzeSchluessel: null, grenzeFest: true,
    quelle: "lauf-bilanz.js (verarbeitet + vertagt + fehlgeschlagen = cluster)",
    beschreibung: "Die Identität der Laufbilanz geht nicht auf — gezählt wurde etwas anderes als gearbeitet."
  }),
  Object.freeze({
    id: "A09", name: "Veränderung eines realen Mandats",
    beobachtung: "realeMandateVeraendert", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "Grundlinienvergleich der Nicht-Kohortenzeilen (Zahl, aktiv, Löschmarken)",
    beschreibung: "Jede Abweichung an einem realen Mandat beendet den Test sofort."
  }),
  Object.freeze({
    id: "A10", name: "Erkannter externer Kommunikationsversuch",
    beobachtung: "kommunikationsversuche", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "Kommunikationsriegel (gesperrte Zustellversuche je Kanal)",
    beschreibung: "Ein gesperrter Versuch beweist, dass ein Kanal den Riegel erreicht hat — der Lauf stoppt zur Klärung."
  }),
  Object.freeze({
    id: "A11", name: "Unerwarteter Commit oder Deployment",
    beobachtung: "productionCommit", grenzeSchluessel: "erwarteterCommit", grenzeFest: null,
    quelle: "Vercel-Deployment (githubCommitSha) gegen den festgeschriebenen Kopf",
    beschreibung: "Der laufende Production-Code ist nicht der, gegen den der Test freigegeben wurde."
  }),
  Object.freeze({
    id: "A12", name: "Überschneidung nicht kompatibler Laufzeitfenster",
    beobachtung: "fensterKonflikte", grenzeSchluessel: null, grenzeFest: 0,
    quelle: "pruefeStartfenster() gegen die 13 Bestandscrons und den Minimal-Cron",
    beschreibung: "Der Test würde in ein belegtes oder ungeklärtes Laufzeitfenster fallen."
  })
]);

const GRENZEN_PFLICHT = Object.freeze([
  "maxFehlerquote",
  "kostenbudgetUsd",
  "maxLaufzeitMinuten",
  "maxRueckstandWachstum",
  "erwarteterCommit"
]);

// Sind alle Grenzen VOR Testbeginn gesetzt? Fehlende Werte blockieren.
function pruefeGrenzen(grenzen = {}) {
  const g = grenzen && typeof grenzen === "object" ? grenzen : {};
  const fehlend = GRENZEN_PFLICHT.filter((name) => {
    const wert = g[name];
    if (name === "erwarteterCommit") return typeof wert !== "string" || !/^[0-9a-f]{40}$/.test(wert);
    if (name === "maxFehlerquote") return !(typeof wert === "number" && Number.isFinite(wert) && wert >= 0 && wert <= 1);
    return !(typeof wert === "number" && Number.isFinite(wert) && wert > 0);
  });
  return Object.freeze({
    vollstaendig: fehlend.length === 0,
    fehlend: Object.freeze(fehlend),
    meldung: fehlend.length === 0
      ? "Alle Abbruchgrenzen sind vor Testbeginn gesetzt."
      : `Testbeginn blockiert: ${fehlend.length} Abbruchgrenze(n) fehlen — ${fehlend.join(", ")}.`
  });
}

function bewerteRegel(regel, beobachtungen, grenzen) {
  const hatBeobachtung = Object.prototype.hasOwnProperty.call(beobachtungen, regel.beobachtung);
  const ist = beobachtungen[regel.beobachtung];
  if (!hatBeobachtung || ist === null || ist === undefined) {
    return { id: regel.id, name: regel.name, bewertbar: false, ausgeloest: false, ist: null, grenze: null,
      meldung: `${regel.id} nicht bewertbar: Messwert ${regel.beobachtung} fehlt.` };
  }
  // Feste Grenze (0 bzw. true) — keine Konfiguration nötig.
  if (regel.grenzeFest !== null) {
    if (regel.grenzeFest === true) {
      const ausgeloest = ist !== true;
      return { id: regel.id, name: regel.name, bewertbar: typeof ist === "boolean", ausgeloest,
        ist, grenze: true,
        meldung: ausgeloest ? `${regel.id} ausgelöst: ${regel.name}.` : `${regel.id} in Ordnung.` };
    }
    const zahl = Number(ist);
    if (!Number.isFinite(zahl)) {
      return { id: regel.id, name: regel.name, bewertbar: false, ausgeloest: false, ist, grenze: regel.grenzeFest,
        meldung: `${regel.id} nicht bewertbar: ${regel.beobachtung} ist keine Zahl.` };
    }
    const ausgeloest = zahl > regel.grenzeFest;
    return { id: regel.id, name: regel.name, bewertbar: true, ausgeloest, ist: zahl, grenze: regel.grenzeFest,
      meldung: ausgeloest ? `${regel.id} ausgelöst: ${regel.name} (${zahl} > ${regel.grenzeFest}).` : `${regel.id} in Ordnung.` };
  }
  // Konfigurierte Grenze — fehlt sie, ist die Regel nicht bewertbar.
  const grenze = grenzen[regel.grenzeSchluessel];
  if (grenze === null || grenze === undefined || grenze === "") {
    return { id: regel.id, name: regel.name, bewertbar: false, ausgeloest: false, ist, grenze: null,
      meldung: `${regel.id} nicht bewertbar: Grenze ${regel.grenzeSchluessel} ist nicht gesetzt.` };
  }
  if (regel.grenzeSchluessel === "erwarteterCommit") {
    const ausgeloest = String(ist) !== String(grenze);
    return { id: regel.id, name: regel.name, bewertbar: true, ausgeloest, ist: String(ist), grenze: String(grenze),
      meldung: ausgeloest ? `${regel.id} ausgelöst: Production läuft auf einem anderen Commit.` : `${regel.id} in Ordnung.` };
  }
  const zahl = Number(ist);
  const grenzZahl = Number(grenze);
  if (!Number.isFinite(zahl) || !Number.isFinite(grenzZahl)) {
    return { id: regel.id, name: regel.name, bewertbar: false, ausgeloest: false, ist, grenze,
      meldung: `${regel.id} nicht bewertbar: Messwert oder Grenze ist keine Zahl.` };
  }
  const ausgeloest = zahl > grenzZahl;
  return { id: regel.id, name: regel.name, bewertbar: true, ausgeloest, ist: zahl, grenze: grenzZahl,
    meldung: ausgeloest ? `${regel.id} ausgelöst: ${regel.name} (${zahl} > ${grenzZahl}).` : `${regel.id} in Ordnung.` };
}

// Die Gesamtentscheidung. FAIL CLOSED in beide Richtungen:
// eine ausgelöste Regel bricht ab — eine nicht bewertbare Regel ebenso.
function pruefeAbbruch({ beobachtungen = {}, grenzen = {} } = {}) {
  const b = beobachtungen && typeof beobachtungen === "object" ? beobachtungen : {};
  const g = grenzen && typeof grenzen === "object" ? grenzen : {};
  const befunde = ABBRUCHREGELN.map((regel) => Object.freeze(bewerteRegel(regel, b, g)));
  const ausgeloest = befunde.filter((f) => f.ausgeloest);
  const nichtBewertbar = befunde.filter((f) => !f.bewertbar);
  const abbrechen = ausgeloest.length > 0 || nichtBewertbar.length > 0;
  return Object.freeze({
    abbrechen,
    weiterlaufen: !abbrechen,
    befunde: Object.freeze(befunde),
    ausgeloest: Object.freeze(ausgeloest.map((f) => f.id)),
    nichtBewertbar: Object.freeze(nichtBewertbar.map((f) => f.id)),
    meldung: abbrechen
      ? `ABBRUCH: ${ausgeloest.length} ausgelöste Regel(n), ${nichtBewertbar.length} nicht bewertbare Regel(n).`
      : `Alle ${befunde.length} Abbruchregeln bewertet und eingehalten.`
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// C · STARTFENSTER
// ═════════════════════════════════════════════════════════════════════════════
//
// Der 500er-Funktionstest darf NICHT starten, solange sein Fenster mit einem
// Bestandscron oder einem Minimal-Cron-Slot kollidiert. Der belegte offene Fall
// ist das Paar 05:45-Lage-Briefing (bis zu 300 s Laufzeit) → 05:48-Slot: die
// beiden teilen kein Schloss, ihre Verträglichkeit ist NICHT nachgewiesen
// (minimal-cron.js, Befund 6). Solange dieser Nachweis fehlt, ist jedes Fenster,
// das beide berührt, gesperrt.

const LAGE_BRIEFING_MINUTE_UTC = 5 * 60 + 45;   // 05:45 UTC
const LAGE_BRIEFING_MAX_LAUFZEIT_MS = 300000;   // vercel.json maxDuration
const MINIMAL_CRON_SLOT_MINUTEN = Object.freeze([18, 48]);

function minuteAusUtc(zeitpunkt) {
  const text = String(zeitpunkt || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/.test(text)) return null;
  const stunde = Number(text.slice(11, 13));
  const minute = Number(text.slice(14, 16));
  if (!Number.isInteger(stunde) || !Number.isInteger(minute)) return null;
  return stunde * 60 + minute;
}

// Prüft ein geplantes Startfenster gegen die Bestandscrons und — falls der
// Minimal-Cron aktiviert wäre — gegen dessen 48 Slots.
function pruefeStartfenster({
  startUtc,
  dauerMinuten,
  crons = [],
  minimalCronAktiv = false,
  ueberschneidung0545Belegt = false
} = {}) {
  const start = minuteAusUtc(startUtc);
  const dauer = Number(dauerMinuten);
  if (start === null || !Number.isFinite(dauer) || dauer <= 0) {
    return Object.freeze({
      startErlaubt: false,
      grund: "startfenster-unvollstaendig",
      konflikte: Object.freeze([]),
      meldung: "Startfenster nicht bewertbar: startUtc oder dauerMinuten fehlt — fail closed."
    });
  }
  const ende = start + dauer;
  const trifft = (minute) => {
    // Fenster über Mitternacht hinaus: beide Umläufe prüfen.
    const kandidaten = [minute, minute + 1440];
    return kandidaten.some((m) => m >= start && m < ende);
  };

  const konflikte = [];

  for (const cron of Array.isArray(crons) ? crons : []) {
    const teile = String((cron && cron.schedule) || "").trim().split(/\s+/);
    const pfad = String((cron && cron.path) || "(unbekannt)");
    if (teile.length !== 5) {
      konflikte.push({ art: "cron-nicht-parsebar", path: pfad, schedule: String((cron && cron.schedule) || "") });
      continue;
    }
    const min = Number(teile[0]);
    const std = teile[1];
    if (!Number.isInteger(min)) {
      konflikte.push({ art: "cron-nicht-parsebar", path: pfad, schedule: cron.schedule });
      continue;
    }
    // Stündliche Crons ("*") treffen jedes Fenster ab 60 Minuten Dauer.
    if (std === "*") {
      if (dauer >= 60 || trifft(min) || trifft(min + 60)) {
        konflikte.push({ art: "bestandscron-im-fenster", path: pfad, schedule: cron.schedule });
      }
      continue;
    }
    const stunde = Number(std);
    if (!Number.isInteger(stunde)) {
      konflikte.push({ art: "cron-nicht-parsebar", path: pfad, schedule: cron.schedule });
      continue;
    }
    if (trifft(stunde * 60 + min)) {
      konflikte.push({ art: "bestandscron-im-fenster", path: pfad, schedule: cron.schedule });
    }
  }

  // Der belegte offene Fall: 05:45-Lage-Briefing und der 05:48-Slot.
  const trifft0545 = trifft(LAGE_BRIEFING_MINUTE_UTC);
  const trifft0548 = trifft(LAGE_BRIEFING_MINUTE_UTC + 3);
  if (trifft0545 && trifft0548 && !ueberschneidung0545Belegt) {
    konflikte.push({
      art: "offene-laufzeitueberschneidung-0545-0548",
      path: "/api/cron/lage-briefing + /api/cron/understanding-rueckstand",
      schedule: "45 5 * * * / 18,48 * * * *",
      hinweis: `Das 05:45-Lage-Briefing darf bis zu ${LAGE_BRIEFING_MAX_LAUFZEIT_MS / 1000} s laufen; `
        + "der 05:48-Slot startet dann während seiner Laufzeit. Die beiden teilen kein Schloss — "
        + "die Verträglichkeit ist NICHT belegt (minimal-cron.js, Befund 6)."
    });
  }

  if (minimalCronAktiv) {
    for (const slotMinute of MINIMAL_CRON_SLOT_MINUTEN) {
      // Der Minimal-Cron feuert stündlich — ein Fenster ab 60 Minuten trifft ihn immer.
      if (dauer >= 60 || trifft(slotMinute) || trifft(slotMinute + 60)) {
        konflikte.push({
          art: "minimal-cron-slot-im-fenster",
          path: minimalCron.MINIMAL_CRON_ROUTE,
          schedule: minimalCron.MINIMAL_CRON_RHYTHMUS,
          slotMinute
        });
      }
    }
  }

  const eindeutig = [];
  const gesehen = new Set();
  for (const k of konflikte) {
    const schluessel = `${k.art}|${k.path}|${k.schedule || ""}|${k.slotMinute ?? ""}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    eindeutig.push(Object.freeze(k));
  }

  return Object.freeze({
    startErlaubt: eindeutig.length === 0,
    grund: eindeutig.length === 0 ? "fenster-frei" : "fensterkonflikt",
    startMinuteUtc: start,
    endeMinuteUtc: ende,
    konflikte: Object.freeze(eindeutig),
    meldung: eindeutig.length === 0
      ? "Startfenster ist frei von Bestandscrons und Minimal-Cron-Slots."
      : `Start gesperrt: ${eindeutig.length} Fensterkonflikt(e) — ${eindeutig.map((k) => k.art).join(", ")}.`
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// GESAMTBEREITSCHAFT
// ═════════════════════════════════════════════════════════════════════════════
// Die eine Frage: darf der Test überhaupt beginnen? Nur wenn ALLES stimmt.
function startbereitschaft({
  konfiguration = {},
  grenzen = {},
  messungen = {},
  startfenster = {},
  isolation = null,
  env = process.env
} = {}) {
  const konfig = pruefeKonfiguration(konfiguration, { messungen });
  const grenzBefund = pruefeGrenzen(grenzen);
  const fenster = pruefeStartfenster(startfenster);
  const riegel = kommunikationsriegel.modus(env);
  const riegelScharf = riegel === kommunikationsriegel.MODUS_TESTFENSTER;
  const isoliert = isolation === null ? null : isolation === true;

  const huerden = [
    { name: "Kapazitäts- und Kostenkonfiguration vollständig", ok: konfig.bereit, detail: konfig.meldung },
    { name: "Alle Abbruchgrenzen gesetzt", ok: grenzBefund.vollstaendig, detail: grenzBefund.meldung },
    { name: "Startfenster frei", ok: fenster.startErlaubt, detail: fenster.meldung },
    { name: "Kommunikationsriegel scharf geschaltet", ok: riegelScharf,
      detail: riegelScharf
        ? `${kommunikationsriegel.SCHALTER}=${kommunikationsriegel.SCHALTER_WERT_GESPERRT} ist gesetzt.`
        : `${kommunikationsriegel.SCHALTER} steht nicht auf ${kommunikationsriegel.SCHALTER_WERT_GESPERRT}.` },
    { name: "Isolation der Kohorte belegt", ok: isoliert === true,
      detail: isoliert === null ? "Kein Isolationsbefund übergeben — nicht bewertbar." : "Isolationsbefund übergeben." }
  ].map((h) => Object.freeze({ ...h }));

  const offen = huerden.filter((h) => !h.ok);
  return Object.freeze({
    startbereit: offen.length === 0,
    huerden: Object.freeze(huerden),
    offen: Object.freeze(offen.map((h) => h.name)),
    konfiguration: konfig,
    grenzen: grenzBefund,
    startfenster: fenster,
    meldung: offen.length === 0
      ? "Alle Vorbedingungen erfüllt — der Start bleibt dennoch eine getrennte Betreiberfreigabe."
      : `NICHT startbereit: ${offen.length} offene Vorbedingung(en).`
  });
}

module.exports = {
  MANDATE_GESAMT,
  PFLICHTWERTE,
  ABBRUCHREGELN,
  GRENZEN_PFLICHT,
  LAGE_BRIEFING_MINUTE_UTC,
  LAGE_BRIEFING_MAX_LAUFZEIT_MS,
  MINIMAL_CRON_SLOT_MINUTEN,
  fairnessUntergrenze,
  pruefeKonfiguration,
  entscheidungstabelle,
  pruefeGrenzen,
  pruefeAbbruch,
  pruefeStartfenster,
  startbereitschaft
};
