"use strict";

// Helmut — Quellenarchitektur · Ebenen-Gedaechtnis (Sprint 19)
// =============================================================================
// REIN, DETERMINISTISCH, KEINE KI, kein Netz, kein Storage.
//
// PROBLEM (analysiert am 2026-07-27, Sprint 19):
// Die politische Entscheidungsebene eines Vorgangs wurde bei JEDER Assemblierung
// vollstaendig neu abgeleitet — auch bei einer Aktualisierung eines bereits
// verstandenen Vorgangs (`understandUpdate`). Der bereits gespeicherte Wert wurde
// dabei nicht einmal gelesen. Folge: ein Vorgang, der einmal belegt als 'bund'
// erkannt war, konnte bei der naechsten Aktualisierung auf 'unknown' zurueckfallen,
// sobald die neue Dokumentmenge kein Institutionssignal mehr trug. Das ist ein
// stiller Datenverlust ohne jeden Gegenwert.
//
// LOESUNG: die Ebene wird nach der ERSTEN erfolgreichen Ermittlung als ermittelt
// betrachtet und danach WIEDERVERWENDET. Neu berechnet wird nur noch, was noch
// nicht ermittelt ist.
//
// REGELN (in dieser Reihenfolge):
//   1. Kein ermittelter Bestand  -> die neue Ermittlung zaehlt (Erstermittlung).
//      Ist auch sie unermittelt, bleibt es ehrlich bei 'unknown'.
//   2. Ermittelter Bestand, neue Ermittlung OHNE Signal -> Bestand bleibt.
//      >>> FAIL CLOSED: eine ermittelte Ebene wird NIE durch 'unknown' ersetzt. <<<
//   3. Ermittelter Bestand, neue Ermittlung gleich       -> Bestand bleibt (bestaetigt).
//   4. Ermittelter Bestand, neue Ermittlung ANDERS:
//        - hoeherwertige Herkunft (KI schlaegt Deriver) -> die neue Ebene gewinnt,
//        - sonst                                        -> Bestand bleibt (stabil).
//
// Damit ist die Ebene MONOTON: sie kann sich hoechstens EINMAL aendern (Deriver ->
// KI) und nie zurueckfallen. Das ist die Voraussetzung dafuer, dass wiederholte
// Laeufe idempotent schreiben und Lage/Briefing/Scoring nicht zwischen zwei
// Ebenen flackern.
//
// KOSTEN: null. Es entsteht KEIN zusaetzlicher KI-Aufruf; im Gegenteil wird die
// bereits bezahlte Ermittlung nicht mehr weggeworfen.
//
// SPEICHERORT: keine neue Spalte, keine Migration. Die Ebene selbst steht wie
// bisher in knowledge_objects.decision_level (gespiegelt auf political_level);
// die Herkunft und der Zeitpunkt der Erstermittlung werden additiv in das bereits
// vorhandene jsonb classification_confidence geschrieben (level_quelle /
// level_ermittelt_am / level_wiederverwendet). Alt-Zeilen ohne diese Schluessel
// bleiben gueltig und werden als Herkunft 'deriver' gelesen.

// Gueltige politische Ebenen. 'unknown' ist bewusst KEINE Ebene, sondern die
// ehrliche Aussage "nicht ermittelt" (siehe classification.js).
const EBENEN = ["international", "eu", "bund", "land", "kommune"];
const UNERMITTELT = "unknown";

// Herkunftsrang: nur eine hoeherwertige Herkunft darf eine bereits ermittelte
// Ebene ueberhaupt ersetzen. Unbekannte/fehlende Herkunft (Alt-Daten, Backfill)
// zaehlt als 'deriver' — sie stammt nachweislich aus der deterministischen
// Ableitung, nicht aus einer KI-Aussage.
const HERKUNFT_RANG = { deriver: 1, ki: 2 };
const HERKUNFT_STANDARD = "deriver";

const KONFIDENZ_RANG = { unknown: 0, low: 1, medium: 2, high: 3 };

function normEbene(wert) {
  return String(wert == null ? "" : wert).trim().toLowerCase();
}

// "Erfolgreich ermittelt" heisst: eine echte Ebene, nicht 'unknown', nicht leer.
function istErmittelt(wert) {
  return EBENEN.includes(normEbene(wert));
}

function herkunftRang(quelle) {
  return HERKUNFT_RANG[String(quelle || "").trim().toLowerCase()] || HERKUNFT_RANG[HERKUNFT_STANDARD];
}

function normHerkunft(quelle) {
  const q = String(quelle || "").trim().toLowerCase();
  return HERKUNFT_RANG[q] ? q : HERKUNFT_STANDARD;
}

function normKonfidenz(wert) {
  const k = String(wert == null ? "" : wert).trim().toLowerCase();
  return KONFIDENZ_RANG[k] != null ? k : "unknown";
}

function hoehereKonfidenz(a, b) {
  return KONFIDENZ_RANG[normKonfidenz(a)] >= KONFIDENZ_RANG[normKonfidenz(b)] ? normKonfidenz(a) : normKonfidenz(b);
}

function normZeitpunkt(wert) {
  const s = String(wert == null ? "" : wert).trim();
  return s ? s.slice(0, 40) : null;
}

// classification_confidence kommt aus PostgREST als Objekt; Alt-/Testdaten koennen
// eine JSON-Zeichenkette sein. Beides fail-safe lesen, nie werfen.
function leseKonfidenzblock(bestand) {
  const roh = bestand && bestand.classification_confidence;
  if (roh && typeof roh === "object" && !Array.isArray(roh)) return roh;
  if (typeof roh === "string" && roh.trim()) {
    try {
      const parsed = JSON.parse(roh);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) { /* kaputtes jsonb ist kein Grund, die Ebene zu verlieren */ }
  }
  return {};
}

// Den gespeicherten Ebenen-Stand eines Vorgangs lesen. decision_level ist fuehrend;
// political_level ist die Alt-Spalte (Vorgaenge aus der Zeit vor Sprint 2) und wird
// nur als Rueckfall gelesen — ein Alt-Vorgang verliert seine Ebene nicht.
function leseBestand(bestand) {
  if (!bestand || typeof bestand !== "object") {
    return { ebene: UNERMITTELT, ermittelt: false, quelle: null, konfidenz: "unknown", ermittelt_am: null };
  }
  const konfidenzblock = leseKonfidenzblock(bestand);
  const primaer = normEbene(bestand.decision_level);
  const ebene = istErmittelt(primaer) ? primaer : normEbene(bestand.political_level);
  const ermittelt = istErmittelt(ebene);
  return {
    ebene: ermittelt ? ebene : UNERMITTELT,
    ermittelt,
    quelle: ermittelt ? normHerkunft(konfidenzblock.level_quelle) : null,
    konfidenz: normKonfidenz(konfidenzblock.level),
    ermittelt_am: ermittelt ? normZeitpunkt(konfidenzblock.level_ermittelt_am) : null
  };
}

// Die neue (frisch berechnete) Ermittlung normalisieren.
function leseNeu(neu) {
  const ebene = normEbene(neu && neu.level);
  const ermittelt = istErmittelt(ebene);
  return {
    ebene: ermittelt ? ebene : UNERMITTELT,
    ermittelt,
    quelle: normHerkunft(neu && neu.quelle),
    konfidenz: normKonfidenz(neu && neu.konfidenz)
  };
}

// KERNENTSCHEIDUNG. Rein: gleiche Eingabe -> gleiche Ausgabe (idempotent).
//
//   bestand: das gespeicherte knowledge_object (oder null/undefined)
//   neu:     { level, quelle: 'deriver'|'ki', konfidenz }
//   jetzt:   ISO-Zeitstempel fuer eine ERSTermittlung (Testbarkeit; Default: now)
//
// Rueckgabe (alle Felder immer gesetzt):
//   { ebene, quelle, konfidenz, ermittelt_am, ermittelt,
//     wiederverwendet, geaendert, grund }
function entscheideEbene({ bestand = null, neu = null, jetzt = null } = {}) {
  const b = leseBestand(bestand);
  const n = leseNeu(neu);
  const zeitpunkt = normZeitpunkt(jetzt) || new Date().toISOString();

  // 1) Noch nie ermittelt -> die neue Ermittlung ist die Erstermittlung.
  if (!b.ermittelt) {
    if (!n.ermittelt) {
      return {
        ebene: UNERMITTELT, quelle: n.quelle, konfidenz: "unknown", ermittelt_am: null,
        ermittelt: false, wiederverwendet: false, geaendert: false, grund: "nicht-ermittelbar"
      };
    }
    return {
      ebene: n.ebene, quelle: n.quelle, konfidenz: n.konfidenz, ermittelt_am: zeitpunkt,
      ermittelt: true, wiederverwendet: false, geaendert: false, grund: "erstermittlung"
    };
  }

  // Ab hier ist eine Ebene ERMITTELT und bleibt es. Der Zeitstempel der
  // Erstermittlung wird nur bei einem echten Wechsel neu gesetzt.
  const bestandBleibt = (grund) => ({
    ebene: b.ebene, quelle: b.quelle || HERKUNFT_STANDARD, konfidenz: b.konfidenz,
    ermittelt_am: b.ermittelt_am, ermittelt: true,
    wiederverwendet: true, geaendert: false, grund
  });

  // 2) Kein neues Signal -> Bestand bleibt (FAIL CLOSED: nie zurueck auf 'unknown').
  if (!n.ermittelt) return bestandBleibt("bestand-bleibt-kein-neues-signal");

  // 3) Gleiche Ebene -> bestaetigt. Herkunft/Konfidenz duerfen sich verbessern,
  //    der Zeitpunkt der Erstermittlung bleibt.
  if (n.ebene === b.ebene) {
    const besser = herkunftRang(n.quelle) > herkunftRang(b.quelle);
    return {
      ebene: b.ebene,
      quelle: besser ? n.quelle : (b.quelle || HERKUNFT_STANDARD),
      konfidenz: hoehereKonfidenz(b.konfidenz, n.konfidenz),
      ermittelt_am: b.ermittelt_am, ermittelt: true,
      wiederverwendet: true, geaendert: false, grund: "bestaetigt"
    };
  }

  // 4) Andere Ebene -> nur eine hoeherwertige Herkunft darf korrigieren.
  if (herkunftRang(n.quelle) > herkunftRang(b.quelle)) {
    return {
      ebene: n.ebene, quelle: n.quelle, konfidenz: n.konfidenz, ermittelt_am: zeitpunkt,
      ermittelt: true, wiederverwendet: false, geaendert: true, grund: "hoeherwertige-herkunft"
    };
  }
  return bestandBleibt("bestand-stabil");
}

module.exports = {
  EBENEN, UNERMITTELT, HERKUNFT_RANG, HERKUNFT_STANDARD,
  istErmittelt, herkunftRang, leseBestand, entscheideEbene
};
