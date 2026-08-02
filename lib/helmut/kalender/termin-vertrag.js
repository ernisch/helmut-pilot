"use strict";

// Kalender — interner Vertrag „Helmut-Termin" (Sprint „Kalender Machbarkeit 1").
// =============================================================================
// Diese Datei definiert die EINE Datenform, in die jede Kalendereinladung
// uebersetzt wird — unabhaengig davon, ob sie aus Outlook, Google Kalender oder
// einem internen Exchange kommt. Alles weitere in Helmut soll spaeter nur noch
// diese Form kennen, nie ICS.
//
// MANDANTENTRENNUNG — die wichtigste Regel dieser Datei:
// `mandat_id` wird der Komponente von aussen als BEREITS VERTRAUENSWUERDIG
// AUFGELOESTER Wert uebergeben. Sie wird NIE aus Absender, ORGANIZER, ATTENDEE,
// Titel oder UID hergeleitet. Der Parser bekommt sie als Parameter und reicht
// sie unveraendert durch; er hat keinen Weg, sie aus Inhalten zu gewinnen.
// (CLAUDE.md §4.1/§4.2 — kein stiller Fallback, kein hartkodierter Mandant.)
//
// KEINE DATENBANK, KEINE MIGRATION: der Vertrag ist bewusst nur eine
// Datenstruktur im Speicher. Wie er spaeter abgelegt wird, entscheidet ein
// spaeterer Sprint.

// ── Feldwerte ────────────────────────────────────────────────────────────────

// METHOD aus RFC 5546. Wir fuehren nur, was wir auch verstehen.
const METHODEN = Object.freeze(["REQUEST", "CANCEL", "PUBLISH", "REPLY", "ADD", "REFRESH", "COUNTER", "DECLINECOUNTER"]);

// Interner Status, deutsch — die Oberflaeche spricht Deutsch (START_HERE §5.6).
const STATUS = Object.freeze({
  BESTAETIGT: "bestaetigt",
  VORLAEUFIG: "vorlaeufig",
  ABGESAGT: "abgesagt"
});

// Ablehnungsgruende. Bewusst maschinenlesbare Kennungen: eine spaetere
// Empfangsschicht soll entscheiden koennen, ohne Klartext zu zerlegen.
const ABLEHNUNG = Object.freeze({
  LEER: "inhalt-leer",
  ZU_GROSS: "inhalt-zu-gross",
  KEIN_ICS: "kein-gueltiges-ics",
  KEIN_VEVENT: "kein-vevent",
  ZU_VIELE_VEVENTS: "zu-viele-vevents",
  UID_FEHLT: "uid-fehlt",
  START_FEHLT: "start-fehlt",
  START_UNGUELTIG: "start-ungueltig",
  ZEITZONE_UNBEKANNT: "zeitzone-unbekannt",
  ZEITZONE_FEHLT: "zeitzone-fehlt",
  MANDAT_FEHLT: "mandat-fehlt"
});

// Obergrenzen. Sicherheitsgrenze, nicht Geschmacksfrage: eine Einladung aus
// einem Postfach ist Fremdeingabe.
const GRENZEN = Object.freeze({
  MAX_BYTES: 512 * 1024,   // 512 KiB Rohinhalt
  MAX_VEVENTS: 200,        // ein Kalenderexport ist keine Einladung
  MAX_TEXT: 1000           // summary/location/organizer-Anzeigename
});

// ── Hilfen ───────────────────────────────────────────────────────────────────

/**
 * Kuerzt und saeubert einen Textwert aus einer fremden Datei.
 * Entfernt Steuerzeichen (auch solche, die in Logzeilen Unfug anrichten),
 * normalisiert Leerraum und begrenzt die Laenge.
 */
function textFeld(wert, maxLen = GRENZEN.MAX_TEXT) {
  if (wert == null) return null;
  let s = String(wert);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Terminidentitaet: Mandat + UID + (bei Serienausnahmen) Recurrence-ID.
 * Das Mandat ist Teil des Schluessels — zwei Mandate koennen dieselbe Einladung
 * bekommen, und beide Termine sind getrennt zu fuehren.
 */
function identitaet(termin) {
  const teile = [
    String(termin.mandat_id || ""),
    String(termin.event_uid || ""),
    termin.recurrence_id == null ? "" : String(termin.recurrence_id)
  ];
  // U+001F (Unit Separator) als Trenner: kann in keinem der drei Werte
  // vorkommen (textFeld entfernt Steuerzeichen, pruefeMandat lehnt sie ab) —
  // damit ist der Schluessel eindeutig zerlegbar und nicht faelschbar.
  return teile.join("\u001f");
}

/**
 * Baut einen Termin-Datensatz. Nur diese Funktion erzeugt die Form — damit
 * kann kein Aufrufer versehentlich ein Feld weglassen oder erfinden.
 */
function baueTermin(felder) {
  return Object.freeze({
    // Identitaet
    mandat_id: felder.mandat_id,
    event_uid: felder.event_uid,
    recurrence_id: felder.recurrence_id == null ? null : felder.recurrence_id,

    // Fortschreibung
    sequence: Number.isInteger(felder.sequence) ? felder.sequence : 0,
    method: felder.method || "PUBLISH",
    status: felder.status || STATUS.BESTAETIGT,
    last_modified: felder.last_modified == null ? null : felder.last_modified,

    // Inhalt
    summary: felder.summary == null ? null : felder.summary,
    start_at: felder.start_at,
    end_at: felder.end_at == null ? null : felder.end_at,
    all_day: felder.all_day === true,
    timezone: felder.timezone == null ? null : felder.timezone,
    location: felder.location == null ? null : felder.location,

    // NUR ANZEIGE — nie fuer die Mandatszuordnung verwendbar.
    organizer: felder.organizer == null ? null : Object.freeze({ ...felder.organizer }),

    // Serienlage. Ehrlichkeit statt Schein: siehe ics-einladung.js.
    serie: Object.freeze({
      ist_serie: felder.serie ? felder.serie.ist_serie === true : false,
      ist_ausnahme: felder.serie ? felder.serie.ist_ausnahme === true : false,
      rrule_roh: felder.serie && felder.serie.rrule_roh ? felder.serie.rrule_roh : null,
      termine_aufgeloest: false
    })
  });
}

/**
 * Prueft eine von aussen gereichte Mandatskennung.
 * Sie MUSS vom Aufrufer stammen. Es gibt hier absichtlich keinen Default und
 * keinen Fallback — ein fehlendes Mandat ist ein Fehler, kein „nimm irgendeins".
 */
function pruefeMandat(mandatId) {
  if (typeof mandatId !== "string") return false;
  const s = mandatId.trim();
  return s.length > 0 && s.length <= 200 && !/[\u0000-\u001f\u007f]/.test(s);
}

module.exports = {
  METHODEN,
  STATUS,
  ABLEHNUNG,
  GRENZEN,
  textFeld,
  identitaet,
  baueTermin,
  pruefeMandat
};
