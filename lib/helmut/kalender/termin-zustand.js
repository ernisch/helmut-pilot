"use strict";

// Kalender — deterministische Zustandslogik (Sprint „Kalender Machbarkeit 1").
// =============================================================================
// Frage, die diese Datei beantwortet: Eine Nachricht kommt an — was passiert mit
// dem Termin, den wir schon haben?
//
// Sie ist bewusst REIN: kein Speicher, keine Datenbank, keine Uhr, kein Zufall.
// Rein → dieselben Eingaben ergeben immer dieselbe Antwort, und genau das ist
// bei Kalendernachrichten entscheidend: E-Mail liefert NICHT in der Reihenfolge
// des Absendens. Eine aeltere Aenderung kann nach einer neueren eintreffen.
//
// ORDNUNG nach RFC 5546 §3.2:
//   1. SEQUENCE entscheidet. Hoeher = neuer.
//   2. Bei gleicher SEQUENCE entscheidet DTSTAMP (hier: `last_modified`).
//   3. Ist beides gleich, ist es dieselbe Nachricht -> nichts aendert sich.

const vertrag = require("./termin-vertrag");
const { STATUS } = vertrag;

const ERGEBNIS = Object.freeze({
  ANGELEGT: "angelegt",
  AKTUALISIERT: "aktualisiert",
  ABGESAGT: "abgesagt",
  UNVERAENDERT: "unveraendert",
  VERALTET_IGNORIERT: "veraltet-ignoriert",
  ABGELEHNT: "abgelehnt"
});

/**
 * Vergleicht zwei Termine in ihrer Fortschreibung.
 * @returns {number} >0 wenn `a` neuer ist, <0 wenn aelter, 0 bei Gleichstand.
 */
function vergleicheStand(a, b) {
  const seqA = Number.isInteger(a.sequence) ? a.sequence : 0;
  const seqB = Number.isInteger(b.sequence) ? b.sequence : 0;
  if (seqA !== seqB) return seqA > seqB ? 1 : -1;

  // Gleiche SEQUENCE -> DTSTAMP/LAST-MODIFIED als Tiebreak. Fehlt der Wert auf
  // einer Seite, gilt sie als NICHT neuer (kein Vorrang durch Auslassen).
  const tA = a.last_modified ? Date.parse(a.last_modified) : NaN;
  const tB = b.last_modified ? Date.parse(b.last_modified) : NaN;
  if (Number.isFinite(tA) && Number.isFinite(tB)) {
    if (tA !== tB) return tA > tB ? 1 : -1;
    return 0;
  }
  if (Number.isFinite(tA) && !Number.isFinite(tB)) return 1;
  if (!Number.isFinite(tA) && Number.isFinite(tB)) return -1;
  return 0;
}

/**
 * Wendet EINE eingegangene Nachricht auf den vorhandenen Stand an.
 *
 * @param {object|null} vorhanden Bisheriger Termin (oder null = noch keiner)
 * @param {object} eingang Neu gelesener Termin aus `ics-einladung.leseEinladung`
 * @returns {{ergebnis:string, termin:object|null, begruendung:string}}
 */
function wendeAn(vorhanden, eingang) {
  if (!eingang || !eingang.event_uid || !eingang.mandat_id) {
    return { ergebnis: ERGEBNIS.ABGELEHNT, termin: vorhanden || null, begruendung: "Eingang ohne Identitaet" };
  }

  // Mandatsschutz. Diese Pruefung ist nicht Formsache: sie ist die Stelle, an
  // der ein Termin des einen Mandats NIEMALS den eines anderen ueberschreiben
  // kann. Sie darf auch dann nicht entfallen, wenn der Aufrufer „sicher weiss",
  // dass er den richtigen Datensatz gezogen hat (CLAUDE.md §4.1).
  if (vorhanden && vorhanden.mandat_id !== eingang.mandat_id) {
    return { ergebnis: ERGEBNIS.ABGELEHNT, termin: vorhanden, begruendung: "Mandat des Eingangs passt nicht zum vorhandenen Termin" };
  }
  if (vorhanden && vertrag.identitaet(vorhanden) !== vertrag.identitaet(eingang)) {
    return { ergebnis: ERGEBNIS.ABGELEHNT, termin: vorhanden, begruendung: "Terminidentitaet passt nicht (UID oder Recurrence-ID)" };
  }

  // ── Neu ────────────────────────────────────────────────────────────────────
  if (!vorhanden) {
    // Eine Absage zu einem Termin, den wir nie hatten, legt keinen Termin an.
    // Sie ordentlich zu verwerfen ist richtiger, als einen abgesagten Termin
    // zu erfinden, den niemand je gesehen hat.
    if (eingang.status === STATUS.ABGESAGT || eingang.method === "CANCEL") {
      return { ergebnis: ERGEBNIS.VERALTET_IGNORIERT, termin: null, begruendung: "Absage zu unbekanntem Termin — nichts anzulegen" };
    }
    return { ergebnis: ERGEBNIS.ANGELEGT, termin: eingang, begruendung: "neue Einladung" };
  }

  // ── Absage ist ein Endzustand ──────────────────────────────────────────────
  // Ist der Termin abgesagt, bleibt er abgesagt. Ein Organisator, der einen
  // abgesagten Termin wiederbeleben will, vergibt eine neue UID — so verlangt
  // es RFC 5546. Alles andere waere ein Wiederauferstehen durch eine
  // verspaetete Nachricht.
  if (vorhanden.status === STATUS.ABGESAGT) {
    return { ergebnis: ERGEBNIS.UNVERAENDERT, termin: vorhanden, begruendung: "Termin ist bereits abgesagt (Endzustand)" };
  }

  const richtung = vergleicheStand(eingang, vorhanden);

  // ── Aeltere, verspaetete Nachricht ─────────────────────────────────────────
  if (richtung < 0) {
    return { ergebnis: ERGEBNIS.VERALTET_IGNORIERT, termin: vorhanden, begruendung: `verspaetete Nachricht (SEQUENCE ${eingang.sequence} <= vorhanden ${vorhanden.sequence})` };
  }

  // ── Gleichstand ────────────────────────────────────────────────────────────
  if (richtung === 0) {
    // Ausnahme mit Grund: eine ABSAGE bei gleichem Stand wird angenommen.
    // Outlook versendet Absagen teils mit unveraenderter SEQUENCE und
    // unveraendertem DTSTAMP. Wuerden wir hier strikt „gleich = nichts tun"
    // sagen, bliebe ein abgesagter Termin im Kalender stehen — der teuerste
    // aller Fehler in diesem Produkt.
    if (eingang.status === STATUS.ABGESAGT || eingang.method === "CANCEL") {
      return { ergebnis: ERGEBNIS.ABGESAGT, termin: eingang, begruendung: "Absage bei gleichem Stand — Absage hat Vorrang" };
    }
    return { ergebnis: ERGEBNIS.UNVERAENDERT, termin: vorhanden, begruendung: "identische Wiederholung" };
  }

  // ── Neuerer Stand ──────────────────────────────────────────────────────────
  if (eingang.status === STATUS.ABGESAGT || eingang.method === "CANCEL") {
    return { ergebnis: ERGEBNIS.ABGESAGT, termin: eingang, begruendung: "Absage mit neuerem Stand" };
  }
  return { ergebnis: ERGEBNIS.AKTUALISIERT, termin: eingang, begruendung: `neuerer Stand (SEQUENCE ${eingang.sequence})` };
}

/**
 * Wendet mehrere Nachrichten in der uebergebenen Reihenfolge an.
 * Nuetzlich fuer den Nachweis, dass die REIHENFOLGE des Eintreffens das
 * Endergebnis nicht veraendert.
 *
 * @param {Array<object>} eingaenge
 * @returns {{stand:Map<string,object>, verlauf:Array}}
 */
function wendeAlleAn(eingaenge) {
  const stand = new Map();
  const verlauf = [];
  for (const eingang of eingaenge || []) {
    const schluessel = vertrag.identitaet(eingang);
    const vorher = stand.get(schluessel) || null;
    const r = wendeAn(vorher, eingang);
    if (r.termin) stand.set(schluessel, r.termin);
    verlauf.push({ schluessel, ergebnis: r.ergebnis, begruendung: r.begruendung });
  }
  return { stand, verlauf };
}

module.exports = { ERGEBNIS, vergleicheStand, wendeAn, wendeAlleAn };
