"use strict";

// Kalender — ICS (RFC 5545) -> Helmut-Termin (Sprint „Kalender Machbarkeit 1").
// =============================================================================
// ISOLIERTE KOMPONENTE. Sie wird von KEINEM aktiven Production-Pfad aufgerufen:
// kein `require` aus server.js, aus client.js, aus einem Cron oder aus einer
// Route. Sie existiert derzeit ausschliesslich fuer den Machbarkeitsnachweis.
//
// WAS SIE TUT: sie liest einen ICS-Text und gibt Helmut-Termine zurueck.
// WAS SIE NICHT TUT — und zwar mit Absicht:
//   · Sie ruft NICHTS ab. Kein `fetch`, kein `http`, kein `fs`. URL, ATTACH und
//     ATTENDEE-Verweise werden nicht einmal gelesen.
//   · Sie verarbeitet KEIN HTML. DESCRIPTION und X-ALT-DESC (dort legt Outlook
//     seinen HTML-Text ab) werden nicht uebernommen — damit gibt es keinen
//     HTML-Wert, den irgendwer spaeter versehentlich rendern koennte.
//   · Sie schickt NICHTS an ein Sprachmodell.
//   · Sie protokolliert KEINE Kalenderinhalte.
//   · Sie leitet das Mandat NICHT aus dem Inhalt ab (siehe termin-vertrag.js).
//
// BIBLIOTHEK: `ical.js` (MPL-2.0, Philipp Kewisch / Thunderbird-Kalender).
// Bewusst kein eigener Parser: Zeilenfaltung, Escaping, Parameter in
// Anfuehrungszeichen, VALUE=DATE, RECURRENCE-ID und RRULE sind zusammen zu
// viel Standard, um sie „mal eben" halb zu implementieren. `ical.js` hat null
// Transitivabhaengigkeiten und fuehrt selbst keine Netz- oder Dateizugriffe aus.

const ICAL = require("ical.js");
const vertrag = require("./termin-vertrag");
const zeitzonen = require("./zeitzonen");

const { ABLEHNUNG, GRENZEN, STATUS } = vertrag;

/** Kontrollierte Ablehnung — immer dieselbe Form, nie eine Ausnahme nach aussen. */
function ablehnen(grund, detail) {
  return Object.freeze({
    ok: false,
    grund,
    // `detail` ist fuer Menschen. Es traegt NIE Kalenderinhalt, nur Struktur.
    detail: detail || null,
    termine: Object.freeze([])
  });
}

/**
 * ICAL.Time -> ISO-8601 in UTC (`2026-08-14T07:30:00Z`).
 * Gibt zusaetzlich zurueck, welche Zone benutzt wurde und ob es einen Hinweis gab.
 */
function zeitpunktZuUtc(icalTime, tzidRoh) {
  // Ganztags: kein Zeitpunkt, sondern ein Datum. Wir erfinden hier bewusst
  // KEINE Uhrzeit und KEINE Zone — ein ganztaegiger Termin hat keine.
  if (icalTime.isDate) {
    const p = (n) => String(n).padStart(2, "0");
    return {
      ok: true,
      wert: `${icalTime.year}-${p(icalTime.month)}-${p(icalTime.day)}`,
      zone: null,
      hinweis: null
    };
  }

  const teile = {
    jahr: icalTime.year, monat: icalTime.month, tag: icalTime.day,
    stunde: icalTime.hour, minute: icalTime.minute, sekunde: icalTime.second
  };

  // Fall 1: DTSTART endet auf `Z` -> bereits UTC, nichts zu raten.
  const zoneName = icalTime.zone && icalTime.zone.tzid ? String(icalTime.zone.tzid) : null;
  const istUtc = zoneName === "Z" || zoneName === "UTC" || (!tzidRoh && zoneName === "UTC");
  if (istUtc) {
    const ms = Date.UTC(teile.jahr, teile.monat - 1, teile.tag, teile.stunde, teile.minute, teile.sekunde);
    return { ok: true, wert: new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"), zone: "UTC", hinweis: null };
  }

  // Fall 2: TZID vorhanden -> auf IANA abbilden, sonst kontrolliert scheitern.
  if (tzidRoh) {
    const iana = zeitzonen.loeseTzidAuf(tzidRoh);
    if (!iana) {
      return { ok: false, grund: ABLEHNUNG.ZEITZONE_UNBEKANNT, detail: `TZID nicht aufloesbar: ${vertrag.textFeld(tzidRoh, 80)}` };
    }
    const { utcMs, hinweis } = zeitzonen.wanduhrZuUtc(teile, iana);
    return { ok: true, wert: new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, "Z"), zone: iana, hinweis };
  }

  // Fall 3: schwebende Zeit (weder `Z` noch TZID). RFC 5545 laesst das zu, aber
  // sie bezeichnet KEINEN eindeutigen Zeitpunkt — sie meint „Ortszeit des
  // Betrachters". Wir raten hier NICHT „wird schon Berlin sein": das waere
  // genau die Sorte stiller Annahme, die spaeter einen Termin um eine Stunde
  // verschiebt. Kontrollierte Ablehnung, dokumentierte Grenze.
  return { ok: false, grund: ABLEHNUNG.ZEITZONE_FEHLT, detail: "DTSTART ohne TZID und ohne UTC-Kennzeichnung (schwebende Zeit)" };
}

/** Rohen TZID-Parameter einer Eigenschaft lesen (ical.js normalisiert ihn weg). */
function tzidVon(prop) {
  if (!prop) return null;
  try {
    const p = prop.getParameter("tzid");
    return p == null ? null : String(p);
  } catch { return null; }
}

/** ORGANIZER — reine Anzeigeinformation. Wird nie zur Mandatsfindung benutzt. */
function organizerVon(vevent) {
  const prop = vevent.getFirstProperty("organizer");
  if (!prop) return null;
  let adresse = null;
  try {
    const roh = String(prop.getFirstValue() || "");
    adresse = roh.replace(/^mailto:/i, "").trim() || null;
  } catch { adresse = null; }
  let name = null;
  try { name = prop.getParameter("cn"); } catch { name = null; }
  const eintrag = {
    name: vertrag.textFeld(name, 200),
    email: vertrag.textFeld(adresse, 320)
  };
  return (eintrag.name || eintrag.email) ? eintrag : null;
}

/** UTC-ISO aus einer Zeitstempel-Eigenschaft (DTSTAMP, LAST-MODIFIED). */
function stempelVon(vevent, feld) {
  const prop = vevent.getFirstProperty(feld);
  if (!prop) return null;
  try {
    const t = prop.getFirstValue();
    if (!t || typeof t.toJSDate !== "function") return null;
    const d = t.toJSDate();
    return Number.isFinite(d.getTime()) ? d.toISOString().replace(/\.\d{3}Z$/, "Z") : null;
  } catch { return null; }
}

/**
 * Uebersetzt EIN VEVENT.
 * @returns {{ok:true, termin:object}|{ok:false, grund:string, detail:string|null}}
 */
function uebersetzeVevent(vevent, mandatId, methodDerDatei) {
  // ── UID ────────────────────────────────────────────────────────────────────
  const uid = vertrag.textFeld(vevent.getFirstPropertyValue("uid"), 512);
  if (!uid) return { ok: false, grund: ABLEHNUNG.UID_FEHLT, detail: "VEVENT ohne UID" };

  // ── DTSTART ────────────────────────────────────────────────────────────────
  const startProp = vevent.getFirstProperty("dtstart");
  if (!startProp) return { ok: false, grund: ABLEHNUNG.START_FEHLT, detail: "VEVENT ohne DTSTART" };
  let startZeit;
  try { startZeit = startProp.getFirstValue(); } catch { startZeit = null; }
  if (!startZeit || typeof startZeit.isDate !== "boolean") {
    return { ok: false, grund: ABLEHNUNG.START_UNGUELTIG, detail: "DTSTART nicht als Zeitwert lesbar" };
  }
  const start = zeitpunktZuUtc(startZeit, tzidVon(startProp));
  if (!start.ok) return { ok: false, grund: start.grund, detail: start.detail };

  const ganztags = startZeit.isDate === true;

  // ── DTEND / DURATION ───────────────────────────────────────────────────────
  // Reihenfolge nach RFC 5545: DTEND, sonst DTSTART + DURATION, sonst Default
  // (ganztags: ein Tag; mit Uhrzeit: Laenge null).
  let ende = null;
  const endProp = vevent.getFirstProperty("dtend");
  if (endProp) {
    let endZeit = null;
    try { endZeit = endProp.getFirstValue(); } catch { endZeit = null; }
    if (endZeit && typeof endZeit.isDate === "boolean") {
      const e = zeitpunktZuUtc(endZeit, tzidVon(endProp));
      if (e.ok) ende = e.wert;
    }
  } else {
    const dauer = vevent.getFirstPropertyValue("duration");
    if (dauer && typeof dauer.toSeconds === "function") {
      const kopie = startZeit.clone();
      kopie.addDuration(dauer);
      const e = zeitpunktZuUtc(kopie, tzidVon(startProp));
      if (e.ok) ende = e.wert;
    } else if (ganztags) {
      const kopie = startZeit.clone();
      kopie.day += 1;
      const e = zeitpunktZuUtc(kopie, null);
      if (e.ok) ende = e.wert;
    } else {
      ende = start.wert;
    }
  }

  // ── RECURRENCE-ID (Ausnahme einer Serie) ───────────────────────────────────
  // Sie ist Teil der IDENTITAET: „der Termin am 14.08." ist ein anderer
  // Datensatz als „die Serie". Deshalb muss sie stabil und vergleichbar sein —
  // wir normalisieren sie auf denselben UTC-/Datumsstring wie DTSTART.
  let recurrenceId = null;
  const recProp = vevent.getFirstProperty("recurrence-id");
  if (recProp) {
    let recZeit = null;
    try { recZeit = recProp.getFirstValue(); } catch { recZeit = null; }
    if (recZeit && typeof recZeit.isDate === "boolean") {
      const r = zeitpunktZuUtc(recZeit, tzidVon(recProp));
      if (!r.ok) return { ok: false, grund: r.grund, detail: `RECURRENCE-ID: ${r.detail}` };
      recurrenceId = r.wert;
    }
  }

  // ── RRULE ──────────────────────────────────────────────────────────────────
  // Wir SPEICHERN die Regel, wir RECHNEN sie aber NICHT aus. Ein aufgeloester
  // Serienkalender ist ein eigener Sprint; hier waere jede Teilaufloesung eine
  // Behauptung, die wir nicht belegen koennen (vgl. CLAUDE.md §4.4).
  const rruleProp = vevent.getFirstProperty("rrule");
  let rruleRoh = null;
  if (rruleProp) {
    try { rruleRoh = vertrag.textFeld(rruleProp.getFirstValue().toString(), 500); } catch { rruleRoh = null; }
  }

  // ── STATUS und METHOD ──────────────────────────────────────────────────────
  const methode = String(methodDerDatei || "PUBLISH").toUpperCase();
  const statusRoh = String(vevent.getFirstPropertyValue("status") || "").toUpperCase();
  let status = STATUS.BESTAETIGT;
  if (statusRoh === "TENTATIVE") status = STATUS.VORLAEUFIG;
  if (statusRoh === "CANCELLED") status = STATUS.ABGESAGT;
  // METHOD:CANCEL schlaegt jeden STATUS-Wert. Outlook sendet Absagen teils ohne
  // `STATUS:CANCELLED` im VEVENT — wer nur STATUS liest, uebersieht die Absage.
  if (methode === "CANCEL") status = STATUS.ABGESAGT;

  // ── SEQUENCE ───────────────────────────────────────────────────────────────
  const seqRoh = vevent.getFirstPropertyValue("sequence");
  const sequence = Number.isFinite(Number(seqRoh)) && Number(seqRoh) >= 0 ? Math.floor(Number(seqRoh)) : 0;

  return {
    ok: true,
    termin: vertrag.baueTermin({
      mandat_id: mandatId,
      event_uid: uid,
      recurrence_id: recurrenceId,
      sequence,
      method: methode,
      status,
      summary: vertrag.textFeld(vevent.getFirstPropertyValue("summary")),
      start_at: start.wert,
      end_at: ende,
      all_day: ganztags,
      timezone: start.zone,
      location: vertrag.textFeld(vevent.getFirstPropertyValue("location")),
      organizer: organizerVon(vevent),
      // DTSTAMP ist der Tiebreak bei gleicher SEQUENCE (RFC 5546 §3.2).
      // LAST-MODIFIED ist optional; DTSTAMP ist in jeder Einladung Pflicht.
      last_modified: stempelVon(vevent, "last-modified") || stempelVon(vevent, "dtstamp"),
      serie: { ist_serie: rruleRoh != null, ist_ausnahme: recurrenceId != null, rrule_roh: rruleRoh }
    }),
    hinweis: start.hinweis
  };
}

/**
 * Hauptfunktion: ICS-Text -> Helmut-Termine.
 *
 * @param {string} icsText Rohinhalt des ICS-Anhangs
 * @param {string} mandatId BEREITS VERTRAUENSWUERDIG AUFGELOESTES Mandat.
 *   Diese Funktion prueft nur, dass ein Wert da ist — sie leitet ihn nie her.
 * @returns {{ok:boolean, grund?:string, detail?:string|null, termine:Array, hinweise?:Array}}
 */
function leseEinladung(icsText, mandatId) {
  if (!vertrag.pruefeMandat(mandatId)) {
    return ablehnen(ABLEHNUNG.MANDAT_FEHLT, "mandat_id fehlt oder ist unbrauchbar — sie muss vom Aufrufer kommen");
  }
  if (typeof icsText !== "string" || icsText.trim() === "") {
    return ablehnen(ABLEHNUNG.LEER, "kein Inhalt");
  }
  // Groessengrenze VOR dem Parsen. Byte-Laenge, nicht Zeichenlaenge: Umlaute
  // zaehlen in UTF-8 doppelt, und begrenzen wollen wir den Speicher.
  const bytes = Buffer.byteLength(icsText, "utf8");
  if (bytes > GRENZEN.MAX_BYTES) {
    return ablehnen(ABLEHNUNG.ZU_GROSS, `${bytes} Bytes ueber Grenze ${GRENZEN.MAX_BYTES}`);
  }

  let wurzel;
  try {
    wurzel = new ICAL.Component(ICAL.parse(icsText));
  } catch (e) {
    // Der Fehlertext der Bibliothek kann Bruchstuecke des Inhalts enthalten —
    // er wird deshalb NICHT durchgereicht.
    return ablehnen(ABLEHNUNG.KEIN_ICS, `Inhalt ist kein lesbares ICS (${e && e.name ? e.name : "Parserfehler"})`);
  }
  if (!wurzel || wurzel.name !== "vcalendar") {
    return ablehnen(ABLEHNUNG.KEIN_ICS, "Wurzelelement ist kein VCALENDAR");
  }

  const vevents = wurzel.getAllSubcomponents("vevent");
  if (!vevents.length) return ablehnen(ABLEHNUNG.KEIN_VEVENT, "keine VEVENT-Komponente");
  if (vevents.length > GRENZEN.MAX_VEVENTS) {
    return ablehnen(ABLEHNUNG.ZU_VIELE_VEVENTS, `${vevents.length} VEVENTs ueber Grenze ${GRENZEN.MAX_VEVENTS}`);
  }

  const methode = String(wurzel.getFirstPropertyValue("method") || "PUBLISH").toUpperCase();

  const termine = [];
  const hinweise = [];
  const abgelehnt = [];
  for (const vevent of vevents) {
    let ergebnis;
    try {
      ergebnis = uebersetzeVevent(vevent, mandatId, methode);
    } catch (e) {
      ergebnis = { ok: false, grund: ABLEHNUNG.KEIN_ICS, detail: `VEVENT nicht verarbeitbar (${e && e.name ? e.name : "Fehler"})` };
    }
    if (ergebnis.ok) {
      termine.push(ergebnis.termin);
      if (ergebnis.hinweis) hinweise.push({ uid: ergebnis.termin.event_uid, hinweis: ergebnis.hinweis });
    } else {
      abgelehnt.push({ grund: ergebnis.grund, detail: ergebnis.detail });
    }
  }

  // Kein einziger verwertbarer Termin -> die Einladung als Ganzes ablehnen,
  // mit dem Grund des ERSTEN Problems (sonst faellt der Grund unter den Tisch).
  if (!termine.length) {
    const erster = abgelehnt[0] || { grund: ABLEHNUNG.KEIN_VEVENT, detail: null };
    return ablehnen(erster.grund, erster.detail);
  }

  return Object.freeze({
    ok: true,
    method: methode,
    termine: Object.freeze(termine),
    hinweise: Object.freeze(hinweise),
    // Teilweise verwertbar ist ein ehrlicher Zustand, kein Fehler und kein
    // stilles Gruen: der Aufrufer erfaehrt, was liegen blieb.
    abgelehnt: Object.freeze(abgelehnt)
  });
}

module.exports = { leseEinladung, ABLEHNUNG, GRENZEN, STATUS };
