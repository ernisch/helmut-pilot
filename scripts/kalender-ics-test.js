"use strict";

// Kalender-Machbarkeitstest — OFFLINE, ohne Netz, ohne DB, ohne LLM, ohne Postfach.
// =============================================================================================
// Prueft die isolierte Kalenderkomponente:
//   lib/helmut/kalender/ics-einladung.js   ICS (RFC 5545) -> Helmut-Termin
//   lib/helmut/kalender/termin-zustand.js  deterministische Zustandslogik
//   lib/helmut/kalender/zeitzonen.js       Zeitzonen-Normalisierung
//
// ABSCHNITTE (Nummern = Pflichtfaelle des Sprintauftrags):
//   A  Outlook-Einladung, Google-Einladung                       (1,2)
//   B  Zeitzonen: Europe/Berlin, UTC, Sommer-/Winterzeit         (3,4,5)
//   C  Ganztaegiger Termin                                       (6)
//   D  Umlaute und gefaltete ICS-Zeilen                          (7)
//   E  Aenderung von Uhrzeit oder Ort                            (8)
//   F  Absage                                                    (9)
//   G  Doppelt empfangene Einladung                              (10)
//   H  Verspaetete aeltere Aenderung                             (11)
//   I  Fehlerhafte Eingaben: UID, Start, ungueltig, zu gross     (12,13,14,15)
//   J  Wiederkehrender Termin                                    (16)
//   K  Aenderung/Absage EINER Wiederholung                       (17)
//   L  Mandantentrennung
//   M  Sicherheitsgrenzen (keine URL, kein HTML, keine Inhalte in Fehlern)
//
// NUR KUENSTLICHE DATEN: alle Namen sind erfunden, alle Domains stammen aus den
// reservierten Bereichen (RFC 2606 / RFC 6761: .test, .example, example.org).
// Keine realen Personen, insbesondere keine Daten des Pilotmandanten.

const ics = require("../lib/helmut/kalender/ics-einladung");
const zustand = require("../lib/helmut/kalender/termin-zustand");
const zeitzonen = require("../lib/helmut/kalender/zeitzonen");
const vertrag = require("../lib/helmut/kalender/termin-vertrag");

const { ERGEBNIS } = zustand;
const { STATUS, ABLEHNUNG } = vertrag;

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

// Zwei erfundene Mandate. Sie stehen fuer „bereits vertrauenswuerdig aufgeloest";
// die Komponente bekommt sie als Parameter und leitet sie nie aus Inhalten ab.
const MANDAT_A = "mandat-a-testkennung";
const MANDAT_B = "mandat-b-testkennung";

// ── Fixture-Baukasten ────────────────────────────────────────────────────────
// Bewusst als ROHTEXT mit CRLF: echte ICS-Dateien benutzen CRLF, und der
// Zeilenumbruch ist bei gefalteten Zeilen genau der kritische Punkt.
function ical(zeilen) { return zeilen.join("\r\n") + "\r\n"; }

/** Outlook-Desktop: Windows-Zonenname, VTIMEZONE mitgeliefert, X-MICROSOFT-Felder. */
function outlookEinladung({ uid = "outlook-uid-1@example.org", sequence = 0, method = "REQUEST",
  dtstart = "20260814T093000", dtend = "20260814T103000", summary = "Fraktionssitzung",
  location = "Sitzungsraum 3.101", dtstamp = "20260801T120000Z", status = null } = {}) {
  return ical([
    "BEGIN:VCALENDAR",
    "PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN",
    "VERSION:2.0",
    `METHOD:${method}`,
    "BEGIN:VTIMEZONE",
    "TZID:W. Europe Standard Time",
    "BEGIN:STANDARD",
    "DTSTART:16011028T030000",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:16010325T020000",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `SEQUENCE:${sequence}`,
    `DTSTART;TZID=W. Europe Standard Time:${dtstart}`,
    `DTEND;TZID=W. Europe Standard Time:${dtend}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    "ORGANIZER;CN=Buero Leitung:mailto:buero@example.org",
    "ATTENDEE;CN=Helmut;RSVP=TRUE:mailto:termine@helmut.test",
    ...(status ? [`STATUS:${status}`] : []),
    "X-MICROSOFT-CDO-BUSYSTATUS:BUSY",
    "END:VEVENT",
    "END:VCALENDAR"
  ]);
}

/** Google Kalender: IANA-Zonenname, andere Feldreihenfolge, keine X-MS-Felder. */
function googleEinladung({ uid = "google-uid-1@google.com", sequence = 0, method = "REQUEST",
  dtstart = "20260814T093000", dtend = "20260814T103000", summary = "Ausschuss Digitales",
  location = "Jakob-Kaiser-Haus", dtstamp = "20260801T120000Z", tzid = "Europe/Berlin" } = {}) {
  return ical([
    "BEGIN:VCALENDAR",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "VERSION:2.0",
    `METHOD:${method}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `DTSTART;TZID=${tzid}:${dtstart}`,
    `DTEND;TZID=${tzid}:${dtend}`,
    `DTSTAMP:${dtstamp}`,
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    "ORGANIZER;CN=Planung:mailto:planung@example.org",
    "STATUS:CONFIRMED",
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ]);
}

/** Minimalgeruest fuer Sonderfaelle. */
function roh(veventZeilen, { method = "REQUEST", extra = [] } = {}) {
  return ical([
    "BEGIN:VCALENDAR", "PRODID:-//Helmut Test//DE", "VERSION:2.0", `METHOD:${method}`,
    ...extra,
    "BEGIN:VEVENT", ...veventZeilen, "END:VEVENT",
    "END:VCALENDAR"
  ]);
}

function ersterTermin(ergebnis) { return ergebnis.termine[0]; }

(function main() {
  // ══ A · Outlook und Google ═════════════════════════════════════════════════
  {
    const r = ics.leseEinladung(outlookEinladung(), MANDAT_A);
    check("A1 Outlook-Einladung wird angenommen", r.ok === true, r.grund || "");
    if (r.ok) {
      const t = ersterTermin(r);
      check("A1 Outlook: UID uebernommen", t.event_uid === "outlook-uid-1@example.org", t.event_uid);
      check("A1 Outlook: Titel uebernommen", t.summary === "Fraktionssitzung", String(t.summary));
      check("A1 Outlook: Ort uebernommen", t.location === "Sitzungsraum 3.101", String(t.location));
      check("A1 Outlook: METHOD=REQUEST", t.method === "REQUEST", t.method);
      check("A1 Outlook: Status bestaetigt", t.status === STATUS.BESTAETIGT, t.status);
      check("A1 Outlook: Organisator nur als Anzeige", t.organizer && t.organizer.email === "buero@example.org",
        JSON.stringify(t.organizer));
      // Der eigentliche Beweis: der Windows-Zonenname wurde aufgeloest.
      check("A1 Outlook: Windows-Zonenname -> Europe/Berlin", t.timezone === "Europe/Berlin", String(t.timezone));
      // 14.08.2026 ist Sommerzeit (MESZ, UTC+2) -> 09:30 Ortszeit = 07:30 UTC.
      check("A1 Outlook: 09:30 Berlin = 07:30 UTC", t.start_at === "2026-08-14T07:30:00Z", t.start_at);
      check("A1 Outlook: Ende 10:30 Berlin = 08:30 UTC", t.end_at === "2026-08-14T08:30:00Z", String(t.end_at));
      check("A1 Outlook: Mandat unveraendert durchgereicht", t.mandat_id === MANDAT_A, t.mandat_id);
    }
  }
  {
    const r = ics.leseEinladung(googleEinladung(), MANDAT_A);
    check("A2 Google-Einladung wird angenommen", r.ok === true, r.grund || "");
    if (r.ok) {
      const t = ersterTermin(r);
      check("A2 Google: UID uebernommen", t.event_uid === "google-uid-1@google.com", t.event_uid);
      check("A2 Google: Titel uebernommen", t.summary === "Ausschuss Digitales", String(t.summary));
      check("A2 Google: IANA-Zone uebernommen", t.timezone === "Europe/Berlin", String(t.timezone));
      check("A2 Google: derselbe UTC-Zeitpunkt wie Outlook", t.start_at === "2026-08-14T07:30:00Z", t.start_at);
    }
  }
  {
    // Der Kern der Machbarkeitsfrage: BEIDE Systeme, gleiche Ortszeit,
    // unterschiedliche Schreibweise — kommt derselbe Zeitpunkt heraus?
    const o = ersterTermin(ics.leseEinladung(outlookEinladung(), MANDAT_A));
    const g = ersterTermin(ics.leseEinladung(googleEinladung(), MANDAT_A));
    check("A3 Outlook und Google ergeben denselben Zeitpunkt",
      o.start_at === g.start_at && o.end_at === g.end_at, `${o.start_at} vs ${g.start_at}`);
  }

  // ══ B · Zeitzonen ══════════════════════════════════════════════════════════
  {
    const r = ics.leseEinladung(roh([
      "UID:utc-1@example.org", "DTSTAMP:20260801T120000Z", "SEQUENCE:0",
      "DTSTART:20260814T073000Z", "DTEND:20260814T083000Z", "SUMMARY:UTC-Termin"
    ]), MANDAT_A);
    check("B4 UTC-Termin (Z-Suffix) wird angenommen", r.ok === true, r.grund || "");
    if (r.ok) {
      const t = ersterTermin(r);
      check("B4 UTC: Zeitpunkt unveraendert", t.start_at === "2026-08-14T07:30:00Z", t.start_at);
      check("B4 UTC: Zone als UTC gefuehrt", t.timezone === "UTC", String(t.timezone));
    }
  }
  {
    // SOMMERZEIT (MESZ, UTC+2): 14.08.2026, 09:30 Berlin -> 07:30 UTC
    const sommer = ersterTermin(ics.leseEinladung(
      googleEinladung({ dtstart: "20260814T093000", dtend: "20260814T103000" }), MANDAT_A));
    // WINTERZEIT (MEZ, UTC+1): 14.01.2026, 09:30 Berlin -> 08:30 UTC
    const winter = ersterTermin(ics.leseEinladung(
      googleEinladung({ dtstart: "20260114T093000", dtend: "20260114T103000" }), MANDAT_A));
    check("B5 Sommerzeit: 09:30 Berlin = 07:30 UTC (UTC+2)", sommer.start_at === "2026-08-14T07:30:00Z", sommer.start_at);
    check("B5 Winterzeit: 09:30 Berlin = 08:30 UTC (UTC+1)", winter.start_at === "2026-01-14T08:30:00Z", winter.start_at);
    check("B5 gleiche Ortszeit ergibt je nach Jahreszeit VERSCHIEDENE UTC-Zeit",
      sommer.start_at.slice(11) !== winter.start_at.slice(11),
      `${sommer.start_at} / ${winter.start_at}`);
  }
  {
    // Umstellungstage selbst — hier liegen die echten Fehler.
    // 2026: Vorstellung So 29.03., Rueckstellung So 25.10.
    const vorher = ersterTermin(ics.leseEinladung(
      googleEinladung({ dtstart: "20260329T010000", dtend: "20260329T013000" }), MANDAT_A));
    check("B5 Umstellungstag 29.03. 01:00 Berlin (noch MEZ) = 00:00 UTC",
      vorher.start_at === "2026-03-29T00:00:00Z", vorher.start_at);
    const nachher = ersterTermin(ics.leseEinladung(
      googleEinladung({ dtstart: "20260329T040000", dtend: "20260329T043000" }), MANDAT_A));
    check("B5 Umstellungstag 29.03. 04:00 Berlin (schon MESZ) = 02:00 UTC",
      nachher.start_at === "2026-03-29T02:00:00Z", nachher.start_at);
    const rueck = ersterTermin(ics.leseEinladung(
      googleEinladung({ dtstart: "20261025T040000", dtend: "20261025T043000" }), MANDAT_A));
    check("B5 Rueckstellung 25.10. 04:00 Berlin (schon MEZ) = 03:00 UTC",
      rueck.start_at === "2026-10-25T03:00:00Z", rueck.start_at);

    // KEIN FALSCHER ALARM: eine ganz normale Uhrzeit am Umstellungstag darf
    // nicht als „nicht existent" gemeldet werden. Ohne diese Zusicherung
    // koennte die Zeitberechnung an der Umstellgrenze falsch rechnen und den
    // Fehler anschliessend selbst zurechtbiegen — mit einem Warnhinweis als
    // einzigem Ueberbleibsel, den niemand pruefen wuerde.
    for (const [wann, roh] of [["29.03. 01:00", "20260329T010000"], ["29.03. 04:00", "20260329T040000"],
      ["25.10. 04:00", "20261025T040000"], ["14.08. 09:30", "20260814T093000"]]) {
      const erg = ics.leseEinladung(googleEinladung({ dtstart: roh, dtend: roh }), MANDAT_A);
      check(`B5 gueltige Ortszeit ${wann} erzeugt KEINEN Nicht-existent-Hinweis`,
        erg.ok === true && erg.hinweise.length === 0, JSON.stringify(erg.hinweise || erg.grund));
    }
  }
  {
    // Nicht existente Ortszeit: 29.03.2026 02:30 gibt es in Berlin nicht.
    // Erwartung: KEIN Absturz, kontrolliertes Ergebnis plus Hinweis.
    const r = ics.leseEinladung(
      googleEinladung({ dtstart: "20260329T023000", dtend: "20260329T033000" }), MANDAT_A);
    check("B5 nicht existente Ortszeit stuerzt nicht ab", r.ok === true, r.grund || "");
    if (r.ok) {
      check("B5 nicht existente Ortszeit wird als Hinweis gemeldet (kein stilles Gruen)",
        r.hinweise.some((h) => h.hinweis === "ortszeit-nicht-existent"), JSON.stringify(r.hinweise));
    }
  }
  {
    // Unbekannte TZID -> ablehnen, NICHT raten.
    const r = ics.leseEinladung(roh([
      "UID:tz-unbekannt@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART;TZID=Fantasia/Nirgendwo:20260814T093000", "SUMMARY:Unbekannte Zone"
    ]), MANDAT_A);
    check("B unbekannte TZID wird abgelehnt statt geraten",
      r.ok === false && r.grund === ABLEHNUNG.ZEITZONE_UNBEKANNT, `${r.ok} ${r.grund}`);
  }
  {
    // Schwebende Zeit (weder Z noch TZID) -> ablehnen statt Berlin annehmen.
    const r = ics.leseEinladung(roh([
      "UID:schwebend@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART:20260814T093000", "SUMMARY:Schwebende Zeit"
    ]), MANDAT_A);
    check("B schwebende Zeit wird abgelehnt statt als Berlin angenommen",
      r.ok === false && r.grund === ABLEHNUNG.ZEITZONE_FEHLT, `${r.ok} ${r.grund}`);
  }
  {
    check("B Windows-Zonenname loest auf", zeitzonen.loeseTzidAuf("W. Europe Standard Time") === "Europe/Berlin");
    check("B IANA-Name loest auf", zeitzonen.loeseTzidAuf("Europe/Berlin") === "Europe/Berlin");
    check("B Mozilla-Pfad-TZID loest auf",
      zeitzonen.loeseTzidAuf("/mozilla.org/20050126_1/Europe/Berlin") === "Europe/Berlin");
    check("B Klammerpraefix loest auf",
      zeitzonen.loeseTzidAuf("(UTC+01:00) W. Europe Standard Time") === "Europe/Berlin");
    check("B Unsinn loest NICHT auf", zeitzonen.loeseTzidAuf("Nicht/Existent") === null);
  }

  // ══ C · Ganztaegiger Termin ════════════════════════════════════════════════
  {
    const r = ics.leseEinladung(roh([
      "UID:ganztag-1@example.org", "DTSTAMP:20260801T120000Z", "SEQUENCE:0",
      "DTSTART;VALUE=DATE:20260814", "DTEND;VALUE=DATE:20260815",
      "SUMMARY:Klausurtag der Fraktion"
    ]), MANDAT_A);
    check("C6 Ganztagstermin wird angenommen", r.ok === true, r.grund || "");
    if (r.ok) {
      const t = ersterTermin(r);
      check("C6 als ganztaegig erkannt", t.all_day === true, String(t.all_day));
      check("C6 Start als reines Datum, ohne erfundene Uhrzeit", t.start_at === "2026-08-14", t.start_at);
      check("C6 Ende als reines Datum (RFC: exklusiv)", t.end_at === "2026-08-15", String(t.end_at));
      check("C6 keine Zeitzone erfunden", t.timezone === null, String(t.timezone));
    }
  }
  {
    // Ganztags ohne DTEND -> RFC-Default ist ein Tag.
    const r = ics.leseEinladung(roh([
      "UID:ganztag-2@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART;VALUE=DATE:20260814", "SUMMARY:Ohne DTEND"
    ]), MANDAT_A);
    check("C6 Ganztags ohne DTEND: Ende = Folgetag",
      r.ok && ersterTermin(r).end_at === "2026-08-15", r.ok ? String(ersterTermin(r).end_at) : r.grund);
  }

  // ══ D · Umlaute und gefaltete Zeilen ═══════════════════════════════════════
  {
    // Eine gefaltete Zeile: Fortsetzung beginnt mit genau EINEM Leerzeichen.
    // Zusaetzlich ein maskiertes Komma (\,) — Standard, aber leicht zu uebersehen.
    const r = ics.leseEinladung(ical([
      "BEGIN:VCALENDAR", "PRODID:-//Helmut Test//DE", "VERSION:2.0", "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:umlaute-1@example.org",
      "DTSTAMP:20260801T120000Z",
      "DTSTART;TZID=Europe/Berlin:20260814T093000",
      "DTEND;TZID=Europe/Berlin:20260814T103000",
      "SUMMARY:Anhörung zur Straßenverkehrsordnung — Änderungsanträge der",
      "  Fraktionen über Bußgelder\\, Fahrverbote und Übergangsfristen",
      "LOCATION:Ausschusssaal 2.300\\, Paul-Löbe-Haus",
      "END:VEVENT", "END:VCALENDAR"
    ]), MANDAT_A);
    check("D7 Einladung mit Umlauten und Faltung wird angenommen", r.ok === true, r.grund || "");
    if (r.ok) {
      const t = ersterTermin(r);
      check("D7 Umlaute unverfaelscht (ä ö ü ß)",
        t.summary.includes("Anhörung") && t.summary.includes("Straßenverkehrsordnung")
        && t.summary.includes("Bußgelder") && t.summary.includes("Übergangsfristen"), String(t.summary));
      check("D7 gefaltete Zeile korrekt zusammengesetzt",
        t.summary.includes("Änderungsanträge der Fraktionen über Bußgelder"), String(t.summary));
      check("D7 maskiertes Komma wird zu echtem Komma",
        t.summary.includes("Bußgelder, Fahrverbote") && !t.summary.includes("\\,"), String(t.summary));
      check("D7 Ort mit Umlaut und maskiertem Komma",
        t.location === "Ausschusssaal 2.300, Paul-Löbe-Haus", String(t.location));
    }
  }

  // ══ E · Aenderung von Uhrzeit oder Ort ═════════════════════════════════════
  {
    const original = ersterTermin(ics.leseEinladung(outlookEinladung({ sequence: 0 }), MANDAT_A));
    const neueZeit = ersterTermin(ics.leseEinladung(outlookEinladung({
      sequence: 1, dtstart: "20260814T140000", dtend: "20260814T150000", dtstamp: "20260802T090000Z"
    }), MANDAT_A));
    const r = zustand.wendeAn(original, neueZeit);
    check("E8 Uhrzeitaenderung aktualisiert den Termin", r.ergebnis === ERGEBNIS.AKTUALISIERT, r.ergebnis);
    check("E8 neue Uhrzeit uebernommen (14:00 Berlin = 12:00 UTC)",
      r.termin.start_at === "2026-08-14T12:00:00Z", r.termin.start_at);

    const neuerOrt = ersterTermin(ics.leseEinladung(outlookEinladung({
      sequence: 2, location: "Sitzungsraum 4.900", dtstamp: "20260802T100000Z"
    }), MANDAT_A));
    const r2 = zustand.wendeAn(r.termin, neuerOrt);
    check("E8 Ortsaenderung aktualisiert den Termin", r2.ergebnis === ERGEBNIS.AKTUALISIERT, r2.ergebnis);
    check("E8 neuer Ort uebernommen", r2.termin.location === "Sitzungsraum 4.900", String(r2.termin.location));
  }
  {
    // Gleiche SEQUENCE, aber neueres DTSTAMP -> laut RFC 5546 der neuere Stand.
    const alt = ersterTermin(ics.leseEinladung(googleEinladung({ sequence: 1, dtstamp: "20260801T120000Z" }), MANDAT_A));
    const neu = ersterTermin(ics.leseEinladung(googleEinladung({
      sequence: 1, dtstamp: "20260802T120000Z", location: "Neuer Raum"
    }), MANDAT_A));
    const r = zustand.wendeAn(alt, neu);
    check("E8 gleiche SEQUENCE + neueres DTSTAMP = Aktualisierung",
      r.ergebnis === ERGEBNIS.AKTUALISIERT && r.termin.location === "Neuer Raum", r.ergebnis);
  }

  // ══ F · Absage ═════════════════════════════════════════════════════════════
  {
    const original = ersterTermin(ics.leseEinladung(outlookEinladung({ sequence: 0 }), MANDAT_A));
    const absage = ersterTermin(ics.leseEinladung(outlookEinladung({
      method: "CANCEL", sequence: 1, dtstamp: "20260802T110000Z", status: "CANCELLED"
    }), MANDAT_A));
    check("F9 Absage wird als METHOD:CANCEL gelesen", absage.method === "CANCEL", absage.method);
    check("F9 Absage setzt Status abgesagt", absage.status === STATUS.ABGESAGT, absage.status);
    const r = zustand.wendeAn(original, absage);
    check("F9 Absage sagt den vorhandenen Termin ab", r.ergebnis === ERGEBNIS.ABGESAGT, r.ergebnis);
    check("F9 Termin traegt danach Status abgesagt", r.termin.status === STATUS.ABGESAGT, r.termin.status);

    // Absage ist Endzustand: eine spaetere Einladung belebt sie nicht wieder.
    const spaeter = ersterTermin(ics.leseEinladung(outlookEinladung({ sequence: 5, dtstamp: "20260803T120000Z" }), MANDAT_A));
    const r2 = zustand.wendeAn(r.termin, spaeter);
    check("F9 abgesagter Termin wird durch spaetere Einladung NICHT wiederbelebt",
      r2.ergebnis === ERGEBNIS.UNVERAENDERT && r2.termin.status === STATUS.ABGESAGT, r2.ergebnis);
  }
  {
    // Outlook-Realitaet: CANCEL ohne STATUS:CANCELLED im VEVENT.
    const nurMethod = ersterTermin(ics.leseEinladung(outlookEinladung({ method: "CANCEL", sequence: 1 }), MANDAT_A));
    check("F9 CANCEL ohne STATUS-Feld wird trotzdem als Absage erkannt",
      nurMethod.status === STATUS.ABGESAGT, nurMethod.status);
  }
  {
    // Absage bei GLEICHEM Stand (Outlook wiederholt teils SEQUENCE und DTSTAMP).
    const original = ersterTermin(ics.leseEinladung(outlookEinladung({ sequence: 1, dtstamp: "20260802T110000Z" }), MANDAT_A));
    const absage = ersterTermin(ics.leseEinladung(outlookEinladung({
      method: "CANCEL", sequence: 1, dtstamp: "20260802T110000Z"
    }), MANDAT_A));
    const r = zustand.wendeAn(original, absage);
    check("F9 Absage bei gleichem Stand hat Vorrang vor 'unveraendert'",
      r.ergebnis === ERGEBNIS.ABGESAGT, r.ergebnis);
  }
  {
    const absage = ersterTermin(ics.leseEinladung(outlookEinladung({ method: "CANCEL", sequence: 1 }), MANDAT_A));
    const r = zustand.wendeAn(null, absage);
    check("F9 Absage zu unbekanntem Termin legt KEINEN Termin an",
      r.ergebnis === ERGEBNIS.VERALTET_IGNORIERT && r.termin === null, r.ergebnis);
  }

  // ══ G · Doppelt empfangene Einladung ═══════════════════════════════════════
  {
    const einmal = ersterTermin(ics.leseEinladung(outlookEinladung(), MANDAT_A));
    const nochmal = ersterTermin(ics.leseEinladung(outlookEinladung(), MANDAT_A));
    const r = zustand.wendeAn(einmal, nochmal);
    check("G10 identische Wiederholung aendert nichts", r.ergebnis === ERGEBNIS.UNVERAENDERT, r.ergebnis);
    check("G10 der vorhandene Datensatz bleibt derselbe", r.termin === einmal);
    // Und dieselbe Datei dreimal hintereinander bleibt ebenso folgenlos.
    const { verlauf } = zustand.wendeAlleAn([einmal, nochmal, nochmal]);
    check("G10 dreifacher Empfang: 1x angelegt, 2x unveraendert",
      verlauf[0].ergebnis === ERGEBNIS.ANGELEGT
      && verlauf[1].ergebnis === ERGEBNIS.UNVERAENDERT
      && verlauf[2].ergebnis === ERGEBNIS.UNVERAENDERT, JSON.stringify(verlauf.map((v) => v.ergebnis)));
  }

  // ══ H · Verspaetete aeltere Aenderung ══════════════════════════════════════
  {
    const neu = ersterTermin(ics.leseEinladung(outlookEinladung({
      sequence: 3, location: "Aktueller Raum", dtstamp: "20260803T120000Z"
    }), MANDAT_A));
    const alt = ersterTermin(ics.leseEinladung(outlookEinladung({
      sequence: 1, location: "Alter Raum", dtstamp: "20260801T120000Z"
    }), MANDAT_A));
    const r = zustand.wendeAn(neu, alt);
    check("H11 verspaetete aeltere Nachricht ueberschreibt nicht", r.ergebnis === ERGEBNIS.VERALTET_IGNORIERT, r.ergebnis);
    check("H11 der neuere Ort bleibt stehen", r.termin.location === "Aktueller Raum", String(r.termin.location));

    // Reihenfolgeunabhaengigkeit: das Endergebnis darf nicht davon abhaengen,
    // in welcher Reihenfolge die Nachrichten eintreffen.
    const a = zustand.wendeAlleAn([alt, neu]);
    const b = zustand.wendeAlleAn([neu, alt]);
    const schluessel = vertrag.identitaet(neu);
    check("H11 Endstand ist reihenfolgeunabhaengig",
      a.stand.get(schluessel).location === b.stand.get(schluessel).location
      && a.stand.get(schluessel).sequence === b.stand.get(schluessel).sequence,
      `${a.stand.get(schluessel).location} vs ${b.stand.get(schluessel).location}`);
    check("H11 in beiden Reihenfolgen gewinnt der neuere Stand",
      b.stand.get(schluessel).location === "Aktueller Raum", String(b.stand.get(schluessel).location));

    // Auch eine verspaetete aeltere ABSAGE darf einen neueren Stand nicht kippen.
    const alteAbsage = ersterTermin(ics.leseEinladung(outlookEinladung({
      method: "CANCEL", sequence: 0, dtstamp: "20260731T120000Z"
    }), MANDAT_A));
    const r2 = zustand.wendeAn(neu, alteAbsage);
    check("H11 verspaetete AELTERE Absage sagt den neueren Termin nicht ab",
      r2.ergebnis === ERGEBNIS.VERALTET_IGNORIERT && r2.termin.status === STATUS.BESTAETIGT, r2.ergebnis);
  }

  // ══ I · Fehlerhafte Eingaben ═══════════════════════════════════════════════
  {
    const r = ics.leseEinladung(roh([
      "DTSTAMP:20260801T120000Z", "DTSTART;TZID=Europe/Berlin:20260814T093000", "SUMMARY:Ohne UID"
    ]), MANDAT_A);
    check("I12 fehlende UID wird abgelehnt", r.ok === false && r.grund === ABLEHNUNG.UID_FEHLT, `${r.ok} ${r.grund}`);
  }
  {
    const r = ics.leseEinladung(roh([
      "UID:ohne-start@example.org", "DTSTAMP:20260801T120000Z", "SUMMARY:Ohne DTSTART"
    ]), MANDAT_A);
    check("I13 fehlender Startzeitpunkt wird abgelehnt",
      r.ok === false && r.grund === ABLEHNUNG.START_FEHLT, `${r.ok} ${r.grund}`);
  }
  {
    for (const [name, inhalt] of [
      ["reiner Text", "Das ist einfach nur ein Satz."],
      ["HTML statt ICS", "<html><body><script>alert(1)</script></body></html>"],
      ["abgeschnittenes ICS", "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:x@example.org"],
      ["JSON", "{\"summary\":\"kein ics\"}"],
      ["leerer String", ""],
      ["nur Leerraum", "   \r\n  "],
      ["VCARD statt VCALENDAR", "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Test\r\nEND:VCARD"],
      ["VCALENDAR ohne VEVENT", "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//x//DE\r\nEND:VCALENDAR"]
    ]) {
      const r = ics.leseEinladung(inhalt, MANDAT_A);
      check(`I14 ungueltiger Inhalt wird kontrolliert abgelehnt: ${name}`,
        r.ok === false && typeof r.grund === "string" && Array.isArray(r.termine) && r.termine.length === 0,
        `${r.ok} ${r.grund}`);
    }
    for (const wert of [null, undefined, 42, {}, [], true]) {
      let r, absturz = false;
      try { r = ics.leseEinladung(wert, MANDAT_A); } catch { absturz = true; }
      check(`I14 Nicht-String (${Object.prototype.toString.call(wert)}) stuerzt nicht ab`,
        absturz === false && r && r.ok === false, absturz ? "Ausnahme geworfen" : String(r && r.grund));
    }
  }
  {
    // Uebermaessig grosser Inhalt: Grenze greift VOR dem Parsen.
    const fuellung = "X".repeat(600 * 1024);
    const gross = roh([
      "UID:gross@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART;TZID=Europe/Berlin:20260814T093000", `SUMMARY:${fuellung}`
    ]);
    const r = ics.leseEinladung(gross, MANDAT_A);
    check("I15 uebermaessig grosser Inhalt wird abgelehnt",
      r.ok === false && r.grund === ABLEHNUNG.ZU_GROSS, `${r.ok} ${r.grund}`);
    check("I15 Ablehnungsgrund traegt keinen Kalenderinhalt",
      !String(r.detail || "").includes("XXXX"), String(r.detail).slice(0, 60));

    // Und: viele VEVENTs (Kalenderexport statt Einladung).
    const vieleZeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//x//DE", "METHOD:PUBLISH"];
    for (let i = 0; i < 250; i += 1) {
      vieleZeilen.push("BEGIN:VEVENT", `UID:massen-${i}@example.org`, "DTSTAMP:20260801T120000Z",
        "DTSTART;TZID=Europe/Berlin:20260814T093000", `SUMMARY:Termin ${i}`, "END:VEVENT");
    }
    vieleZeilen.push("END:VCALENDAR");
    const rv = ics.leseEinladung(ical(vieleZeilen), MANDAT_A);
    check("I15 Kalenderexport mit 250 VEVENTs wird abgelehnt",
      rv.ok === false && rv.grund === ABLEHNUNG.ZU_VIELE_VEVENTS, `${rv.ok} ${rv.grund}`);
  }
  {
    // Ein langer, aber zulaessiger Titel wird gekuerzt statt abgelehnt.
    const r = ics.leseEinladung(roh([
      "UID:langer-titel@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART;TZID=Europe/Berlin:20260814T093000", `SUMMARY:${"A".repeat(5000)}`
    ]), MANDAT_A);
    check("I15 ueberlanger Titel wird gekuerzt, nicht abgelehnt",
      r.ok === true && ersterTermin(r).summary.length === vertrag.GRENZEN.MAX_TEXT,
      r.ok ? String(ersterTermin(r).summary.length) : r.grund);
  }

  // ══ J · Wiederkehrender Termin ═════════════════════════════════════════════
  {
    const r = ics.leseEinladung(roh([
      "UID:serie-1@example.org", "DTSTAMP:20260801T120000Z", "SEQUENCE:0",
      "DTSTART;TZID=Europe/Berlin:20260907T090000",
      "DTEND;TZID=Europe/Berlin:20260907T100000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10",
      "SUMMARY:Wochenauftakt"
    ]), MANDAT_A);
    check("J16 Serientermin wird angenommen", r.ok === true, r.grund || "");
    if (r.ok) {
      const t = ersterTermin(r);
      check("J16 als Serie erkannt", t.serie.ist_serie === true, String(t.serie.ist_serie));
      check("J16 Serienregel im Rohtext erhalten",
        typeof t.serie.rrule_roh === "string" && t.serie.rrule_roh.includes("FREQ=WEEKLY"), String(t.serie.rrule_roh));
      check("J16 Serie ist KEINE Ausnahme", t.serie.ist_ausnahme === false);
      // EHRLICHE GRENZE: die Serie wird bewusst NICHT in Einzeltermine aufgeloest.
      check("J16 Serie wird nicht aufgeloest — und sagt das auch",
        t.serie.termine_aufgeloest === false, String(t.serie.termine_aufgeloest));
      check("J16 nur EIN Datensatz (der Serienkopf), keine erfundenen Einzeltermine",
        r.termine.length === 1, String(r.termine.length));
      check("J16 Start ist der erste Termin der Serie (07.09.2026 09:00 Berlin = 07:00 UTC)",
        t.start_at === "2026-09-07T07:00:00Z", t.start_at);
    }
  }

  // ══ K · Aenderung/Absage EINER Wiederholung ════════════════════════════════
  {
    const serie = ersterTermin(ics.leseEinladung(roh([
      "UID:serie-2@example.org", "DTSTAMP:20260801T120000Z", "SEQUENCE:0",
      "DTSTART;TZID=Europe/Berlin:20260907T090000",
      "DTEND;TZID=Europe/Berlin:20260907T100000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10", "SUMMARY:Wochenauftakt"
    ]), MANDAT_A));

    // Eine einzelne Wiederholung wird verschoben: gleiche UID, aber RECURRENCE-ID.
    const ausnahme = ersterTermin(ics.leseEinladung(roh([
      "UID:serie-2@example.org", "DTSTAMP:20260802T120000Z", "SEQUENCE:1",
      "RECURRENCE-ID;TZID=Europe/Berlin:20260914T090000",
      "DTSTART;TZID=Europe/Berlin:20260914T140000",
      "DTEND;TZID=Europe/Berlin:20260914T150000",
      "SUMMARY:Wochenauftakt (verschoben)"
    ]), MANDAT_A));
    check("K17 Serienausnahme wird als Ausnahme erkannt", ausnahme.serie.ist_ausnahme === true);
    check("K17 Recurrence-ID normalisiert (14.09. 09:00 Berlin = 07:00 UTC)",
      ausnahme.recurrence_id === "2026-09-14T07:00:00Z", String(ausnahme.recurrence_id));
    check("K17 Ausnahme hat EIGENE Identitaet, verschieden von der Serie",
      vertrag.identitaet(ausnahme) !== vertrag.identitaet(serie));
    check("K17 Ausnahme traegt dieselbe UID wie die Serie",
      ausnahme.event_uid === serie.event_uid, ausnahme.event_uid);

    // Beide zusammen: die Ausnahme darf die Serie NICHT ueberschreiben.
    const { stand } = zustand.wendeAlleAn([serie, ausnahme]);
    check("K17 Serie und Ausnahme liegen als ZWEI Datensaetze vor", stand.size === 2, String(stand.size));
    check("K17 Serienkopf bleibt unveraendert",
      stand.get(vertrag.identitaet(serie)).start_at === "2026-09-07T07:00:00Z");
    check("K17 Ausnahme traegt die verschobene Zeit (14:00 Berlin = 12:00 UTC)",
      stand.get(vertrag.identitaet(ausnahme)).start_at === "2026-09-14T12:00:00Z");

    // Absage EINER Wiederholung.
    const einzelAbsage = ersterTermin(ics.leseEinladung(roh([
      "UID:serie-2@example.org", "DTSTAMP:20260803T120000Z", "SEQUENCE:2",
      "RECURRENCE-ID;TZID=Europe/Berlin:20260914T090000",
      "DTSTART;TZID=Europe/Berlin:20260914T140000", "SUMMARY:Wochenauftakt"
    ], { method: "CANCEL" }), MANDAT_A));
    const rA = zustand.wendeAn(stand.get(vertrag.identitaet(ausnahme)), einzelAbsage);
    check("K17 Absage EINER Wiederholung sagt nur diese ab", rA.ergebnis === ERGEBNIS.ABGESAGT, rA.ergebnis);
    const rS = zustand.wendeAn(serie, einzelAbsage);
    check("K17 die Einzelabsage kann die SERIE nicht abschiessen",
      rS.ergebnis === ERGEBNIS.ABGELEHNT && rS.termin.status === STATUS.BESTAETIGT, rS.ergebnis);
  }

  // ══ L · Mandantentrennung ══════════════════════════════════════════════════
  {
    const fuerA = ersterTermin(ics.leseEinladung(outlookEinladung(), MANDAT_A));
    const fuerB = ersterTermin(ics.leseEinladung(outlookEinladung(), MANDAT_B));
    check("L dieselbe Einladung ergibt fuer zwei Mandate zwei Identitaeten",
      vertrag.identitaet(fuerA) !== vertrag.identitaet(fuerB));
    const r = zustand.wendeAn(fuerA, fuerB);
    check("L ein Termin von Mandat B ueberschreibt Mandat A nicht",
      r.ergebnis === ERGEBNIS.ABGELEHNT && r.termin.mandat_id === MANDAT_A, r.ergebnis);
    // Die Begruendung muss das MANDAT benennen. Die Identitaetspruefung wuerde
    // denselben Fall zwar auch abfangen (mandat_id steckt im Schluessel) — dann
    // aber mit „UID passt nicht". Ein Uebergriff zwischen Mandaten und ein
    // simpler UID-Irrlaeufer sind nicht dasselbe Ereignis und duerfen im
    // Betrieb nicht gleich aussehen.
    check("L Ablehnung benennt ausdruecklich das Mandat, nicht die UID",
      /Mandat/.test(r.begruendung) && !/UID/.test(r.begruendung), r.begruendung);
    const { stand } = zustand.wendeAlleAn([fuerA, fuerB]);
    check("L beide Mandate haben getrennte Termine", stand.size === 2, String(stand.size));
  }
  {
    for (const schlecht of [null, undefined, "", "   ", 42, {}]) {
      const r = ics.leseEinladung(outlookEinladung(), schlecht);
      check(`L ohne brauchbares Mandat wird abgelehnt (${JSON.stringify(schlecht)})`,
        r.ok === false && r.grund === ABLEHNUNG.MANDAT_FEHLT, `${r.ok} ${r.grund}`);
    }
  }
  {
    // Der Kern von CLAUDE.md §4.2: der Inhalt darf das Mandat nicht beeinflussen.
    // Zwei Einladungen mit voellig verschiedenen Organisatoren, Titeln und UIDs,
    // aber demselben uebergebenen Mandat -> beide tragen genau dieses Mandat.
    const a = ersterTermin(ics.leseEinladung(outlookEinladung({ uid: "x1@example.org" }), MANDAT_A));
    const b = ersterTermin(ics.leseEinladung(googleEinladung({ uid: "x2@google.com" }), MANDAT_A));
    check("L Mandat kommt ausschliesslich vom Aufrufer, nie aus dem Inhalt",
      a.mandat_id === MANDAT_A && b.mandat_id === MANDAT_A);
    // Selbst wenn der Inhalt eine fremde Mandatskennung nennt.
    const boesartig = ersterTermin(ics.leseEinladung(roh([
      "UID:angriff@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART;TZID=Europe/Berlin:20260814T093000",
      `SUMMARY:${MANDAT_B}`,
      `ORGANIZER;CN=${MANDAT_B}:mailto:${MANDAT_B}@example.org`,
      `X-HELMUT-MANDAT:${MANDAT_B}`
    ]), MANDAT_A));
    check("L Mandatskennung im Inhalt wird ignoriert (kein Uebernahmeversuch)",
      boesartig.mandat_id === MANDAT_A, boesartig.mandat_id);
  }

  // ══ M · Sicherheitsgrenzen ═════════════════════════════════════════════════
  {
    // URL, ATTACH, DESCRIPTION und X-ALT-DESC (Outlook-HTML) duerfen NICHT in
    // den Vertrag gelangen. Nicht „maskiert" — gar nicht erst uebernommen.
    const r = ics.leseEinladung(roh([
      "UID:sicherheit@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART;TZID=Europe/Berlin:20260814T093000",
      "SUMMARY:Termin mit Anhaengen",
      "URL:https://boese.invalid/tracker",
      "ATTACH;FMTTYPE=application/pdf:https://boese.invalid/datei.pdf",
      "DESCRIPTION:Bitte hier klicken https://boese.invalid/klick",
      "X-ALT-DESC;FMTTYPE=text/html:<html><body><img src=\"https://boese.invalid/pixel.gif\"></body></html>"
    ]), MANDAT_A);
    check("M Einladung mit URL/ATTACH/HTML wird angenommen (kein Absturz)", r.ok === true, r.grund || "");
    if (r.ok) {
      const t = ersterTermin(r);
      const alsText = JSON.stringify(t);
      check("M keine externe URL im Vertrag", !alsText.includes("boese.invalid"), alsText.slice(0, 200));
      check("M kein HTML im Vertrag", !alsText.includes("<html") && !alsText.includes("<img"), alsText.slice(0, 200));
      check("M kein DESCRIPTION-Feld im Vertrag", !("description" in t) && !alsText.includes("Bitte hier klicken"));
      check("M kein ATTACH-Feld im Vertrag", !("attach" in t) && !("url" in t));
      const felder = Object.keys(t).sort().join(",");
      check("M Vertrag enthaelt genau die vereinbarten Felder",
        felder === "all_day,end_at,event_uid,last_modified,location,mandat_id,method,organizer,recurrence_id,sequence,serie,start_at,status,summary,timezone",
        felder);
    }
  }
  {
    // Steuerzeichen aus einem fremden Titel duerfen keine Logzeile faelschen.
    const r = ics.leseEinladung(roh([
      "UID:steuerzeichen@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART;TZID=Europe/Berlin:20260814T093000",
      "SUMMARY:Harmlos\\nzustand=ok erfolgreich=6"
    ]), MANDAT_A);
    check("M Zeilenumbruch im Titel wird entschaerft",
      r.ok && !/[\r\n]/.test(String(ersterTermin(r).summary)),
      r.ok ? JSON.stringify(ersterTermin(r).summary) : r.grund);

    // Ein ROHES Steuerzeichen ist der eigentliche Fall: der Zeilenumbruch oben
    // faellt schon der Leerraum-Normalisierung zum Opfer (\s trifft \n), ein
    // BEL (U+0007) aber NICHT. Nur die ausdrueckliche Steuerzeichenklasse
    // entfernt ihn — ohne sie ginge er unbemerkt in jede Ausgabe.
    const mitBel = ics.leseEinladung(roh([
      "UID:bel@example.org", "DTSTAMP:20260801T120000Z",
      "DTSTART;TZID=Europe/Berlin:20260814T093000",
      "SUMMARY:Vorher\u0007Nachher"
    ]), MANDAT_A);
    check("M rohes Steuerzeichen (U+0007) wird aus dem Titel entfernt",
      mitBel.ok && !/[\u0000-\u001f\u007f]/.test(String(ersterTermin(mitBel).summary)),
      mitBel.ok ? JSON.stringify(ersterTermin(mitBel).summary) : mitBel.grund);
  }
  {
    // Der Vertrag ist eingefroren — nachtraegliches Verbiegen faellt auf.
    const t = ersterTermin(ics.leseEinladung(outlookEinladung(), MANDAT_A));
    let geaendert = false;
    try { t.mandat_id = MANDAT_B; geaendert = t.mandat_id === MANDAT_B; } catch { geaendert = false; }
    check("M Termindatensatz ist unveraenderlich (mandat_id nicht ueberschreibbar)", geaendert === false);
  }
  {
    // Kein Modul der Komponente darf Netz oder Dateisystem beruehren.
    const fs = require("fs");
    const quellen = ["ics-einladung", "termin-zustand", "zeitzonen", "termin-vertrag"]
      .map((n) => fs.readFileSync(require.resolve(`../lib/helmut/kalender/${n}.js`), "utf8"));
    const verbotene = /require\(\s*["'](https?|net|tls|dgram|child_process|fs)["']\s*\)|\bfetch\s*\(|XMLHttpRequest/;
    check("M kein Netz-, Datei- oder Prozesszugriff in der Kalenderkomponente",
      quellen.every((q) => !verbotene.test(q)));
  }
  {
    // Die Komponente darf von keinem aktiven Production-Pfad aufgerufen werden.
    const fs = require("fs");
    const path = require("path");
    const wurzel = path.join(__dirname, "..");
    const aktive = ["server.js", "client.js", "api/index.js"]
      .map((f) => fs.readFileSync(path.join(wurzel, f), "utf8"));
    const libDateien = fs.readdirSync(path.join(wurzel, "lib", "helmut"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => fs.readFileSync(path.join(wurzel, "lib", "helmut", f), "utf8"));
    const ruft = /kalender\//;
    check("M kein aktiver Production-Pfad ruft die Kalenderkomponente auf",
      aktive.every((q) => !ruft.test(q)) && libDateien.every((q) => !ruft.test(q)));
  }

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Kalender-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})();
