"use strict";

// Mutationsprobe zur Kalender-Machbarkeitssuite (Sprint „Kalender Machbarkeit 1").
// =============================================================================
// 124 gruene Assertions beweisen fuer sich genommen NICHTS — sie koennten alle an
// Belanglosigkeiten haengen. Diese Probe nimmt jede zentrale Garantie EINZELN
// zurueck und prueft, dass scripts/kalender-ics-test.js die Ruecknahme bemerkt.
// Ueberlebt eine Mutation, ist die betreffende Garantie NICHT durch Tests gedeckt.
//
// Die Arbeitskopie wird nicht angefasst: jede Mutation laeuft in einem eigenen
// temporaeren Abzug (siehe e2e-mutationsprobe-geruest.js).
//
// Aufruf: node scripts/kalender-ics-mutationsprobe.js [--verbose]

const { fuehreMutationsprobe } = require("./e2e-mutationsprobe-geruest");

const KAL = "lib/helmut/kalender";

fuehreMutationsprobe({
  titel: "Mutationsprobe Kalender — ICS-Verstaendnis und Zustandslogik",
  suite: "kalender-ics-test.js",
  // Die Suite prueft ausdruecklich, dass KEIN aktiver Production-Pfad die
  // Komponente aufruft — dafuer muessen diese Dateien im Abzug liegen.
  // node_modules traegt ical.js (die einzige Abhaengigkeit des Repos).
  zusatzdateien: ["server.js", "client.js", "api/index.js", "package.json"],
  zusatzverzeichnisse: ["node_modules"],
  mutationen: [
    {
      name: "M1  Windows-Zonenname wird nicht mehr aufgeloest",
      beschreibung: "Ohne die CLDR-Tabelle waere JEDE Outlook-Desktop-Einladung unverarbeitbar — der Kernfall des Sprints.",
      datei: `${KAL}/zeitzonen.js`,
      von: '"w. europe standard time": "Europe/Berlin",',
      nach: '"w-europe-standard-time-DEAKTIVIERT": "Europe/Berlin",'
    },
    {
      name: "M2  METHOD:CANCEL setzt den Status nicht mehr",
      beschreibung: "Outlook sendet Absagen teils ohne STATUS:CANCELLED. Ohne diese Zeile bliebe ein abgesagter Termin stehen.",
      datei: `${KAL}/ics-einladung.js`,
      von: 'if (methode === "CANCEL") status = STATUS.ABGESAGT;',
      nach: '// Mutation: METHOD:CANCEL wird ignoriert'
    },
    {
      name: "M3  verspaetete aeltere Nachricht wird nicht mehr abgewiesen",
      beschreibung: "Ohne Ordnungspruefung koennte eine alte Nachricht den aktuellen Stand ueberschreiben.",
      datei: `${KAL}/termin-zustand.js`,
      von: "if (richtung < 0) {",
      nach: "if (false) {"
    },
    {
      name: "M4  Mandatspruefung in der Zustandslogik entfaellt",
      beschreibung: "Der Termin eines Mandats koennte den eines anderen ueberschreiben — Bruch der Mandantentrennung.",
      datei: `${KAL}/termin-zustand.js`,
      von: "if (vorhanden && vorhanden.mandat_id !== eingang.mandat_id) {",
      nach: "if (false) {"
    },
    {
      name: "M5  Absage ist kein Endzustand mehr",
      beschreibung: "Eine spaetere Nachricht koennte einen abgesagten Termin wiederbeleben.",
      datei: `${KAL}/termin-zustand.js`,
      von: "if (vorhanden.status === STATUS.ABGESAGT) {",
      nach: "if (false) {"
    },
    {
      // Die Ruecknahme muss SEMANTISCH sein, nicht bloss zerstoerend: eine
      // Mutation, die die Suite abstuerzen laesst, faerbt sie zwar rot, sagt
      // aber nicht, WELCHE Zusicherung fehlt. Hier faellt der Zweig sauber auf
      // „unveraendert" zurueck — genau das Verhalten, das falsch waere.
      name: "M6  Absage bei gleichem Stand verliert ihren Vorrang",
      beschreibung: "Outlook wiederholt bei Absagen teils SEQUENCE und DTSTAMP — dann bliebe der Termin bestehen.",
      datei: `${KAL}/termin-zustand.js`,
      von: 'return { ergebnis: ERGEBNIS.ABGESAGT, termin: eingang, begruendung: "Absage bei gleichem Stand — Absage hat Vorrang" };',
      nach: 'return { ergebnis: ERGEBNIS.UNVERAENDERT, termin: vorhanden, begruendung: "Mutation: Absage ohne Vorrang" };'
    },
    {
      name: "M7  Groessengrenze entfaellt",
      beschreibung: "Fremdeingabe aus einem Postfach ohne Obergrenze — Speicher- und Rechenrisiko.",
      datei: `${KAL}/ics-einladung.js`,
      von: "if (bytes > GRENZEN.MAX_BYTES) {",
      nach: "if (false) {"
    },
    {
      name: "M8  VEVENT-Obergrenze entfaellt",
      beschreibung: "Ein ganzer Kalenderexport wuerde als Einladung durchgehen.",
      datei: `${KAL}/ics-einladung.js`,
      von: "if (vevents.length > GRENZEN.MAX_VEVENTS) {",
      nach: "if (false) {"
    },
    {
      name: "M9  schwebende Zeit wird als Europe/Berlin geraten",
      beschreibung: "Genau die stille Annahme, die einen Termin um eine Stunde verschiebt — statt kontrollierter Ablehnung.",
      datei: `${KAL}/ics-einladung.js`,
      von: 'return { ok: false, grund: ABLEHNUNG.ZEITZONE_FEHLT, detail: "DTSTART ohne TZID und ohne UTC-Kennzeichnung (schwebende Zeit)" };',
      nach: 'const g = zeitzonen.wanduhrZuUtc(teile, "Europe/Berlin");\n  return { ok: true, wert: new Date(g.utcMs).toISOString().replace(/\\.\\d{3}Z$/, "Z"), zone: "Europe/Berlin", hinweis: null };'
    },
    {
      name: "M10 unbekannte TZID wird auf Europe/Berlin geraten",
      beschreibung: "Eine nicht aufloesbare Zone still zu ersetzen erzeugt einen falschen, aber plausiblen Zeitpunkt.",
      datei: `${KAL}/ics-einladung.js`,
      von: "      return { ok: false, grund: ABLEHNUNG.ZEITZONE_UNBEKANNT, detail: `TZID nicht aufloesbar: ${vertrag.textFeld(tzidRoh, 80)}` };",
      nach: '      const g = zeitzonen.wanduhrZuUtc(teile, "Europe/Berlin");\n      return { ok: true, wert: new Date(g.utcMs).toISOString().replace(/\\.\\d{3}Z$/, "Z"), zone: "Europe/Berlin", hinweis: null };'
    },
    {
      name: "M11 fehlende UID wird durchgelassen",
      beschreibung: "Ohne UID gibt es keine Identitaet — jede Folgenachricht erzeugte einen neuen Termin.",
      datei: `${KAL}/ics-einladung.js`,
      von: 'if (!uid) return { ok: false, grund: ABLEHNUNG.UID_FEHLT, detail: "VEVENT ohne UID" };',
      nach: 'const uidErsatz = uid || "ersatz-uid";'
    },
    {
      name: "M12 fehlender DTSTART wird durchgelassen",
      beschreibung: "Ein Termin ohne Startzeitpunkt ist kein Termin.",
      datei: `${KAL}/ics-einladung.js`,
      von: 'if (!startProp) return { ok: false, grund: ABLEHNUNG.START_FEHLT, detail: "VEVENT ohne DTSTART" };',
      nach: "// Mutation: DTSTART ist optional"
    },
    {
      name: "M13 Recurrence-ID faellt aus der Terminidentitaet",
      beschreibung: "Die Ausnahme einer Serie wuerde den Serienkopf ueberschreiben — Pflichtfall 17.",
      datei: `${KAL}/termin-vertrag.js`,
      von: '    termin.recurrence_id == null ? "" : String(termin.recurrence_id)',
      nach: '    ""'
    },
    {
      name: "M14 Sommerzeitkorrektur an der Umstellgrenze entfaellt",
      beschreibung: "Ohne die zweite Offsetpruefung liegen Termine am Umstellungstag um eine Stunde daneben.",
      datei: `${KAL}/zeitzonen.js`,
      von: "  if (off2 !== off1) ms = alsWaereUtc - off2;",
      nach: "  // Mutation: keine Korrektur ueber die Umstellgrenze"
    },
    {
      name: "M15 Steuerzeichen werden nicht mehr aus Textfeldern entfernt",
      beschreibung: "Ein fremder Titel koennte eine Logzeile faelschen (Zeilenumbruch-Einschleusung).",
      datei: `${KAL}/termin-vertrag.js`,
      von: '  s = s.replace(/[\\u0000-\\u001f\\u007f]/g, " ");',
      nach: "  // Mutation: Steuerzeichen bleiben stehen"
    },
    {
      name: "M16 Mandatspruefung beim Einlesen entfaellt",
      beschreibung: "Ohne uebergebenes Mandat wuerde ein Termin ohne Zuordnung entstehen.",
      datei: `${KAL}/ics-einladung.js`,
      von: "if (!vertrag.pruefeMandat(mandatId)) {",
      nach: "if (false) {"
    },
    {
      // Erster Anlauf dieser Mutation zielte auf ics-einladung.js und ueberlebte —
      // zu Recht: `baueTermin` ist eine WEISSE LISTE und haette das Zusatzfeld
      // ohnehin verworfen. Die Garantie haengt also an baueTermin, und genau
      // dort muss die Ruecknahme ansetzen, sonst prueft die Probe ins Leere.
      name: "M17 DESCRIPTION wandert in den Vertrag",
      beschreibung: "Beschreibungstexte tragen Links und HTML — die Feldliste des Vertrags muss eine weisse Liste bleiben.",
      datei: `${KAL}/termin-vertrag.js`,
      von: "    // NUR ANZEIGE — nie fuer die Mandatszuordnung verwendbar.",
      nach: "    description: felder.description == null ? null : felder.description,\n    // NUR ANZEIGE — nie fuer die Mandatszuordnung verwendbar."
    },
    {
      name: "M18 Ablehnung nennt Mandatsuebergriff nicht mehr beim Namen",
      beschreibung: "Ein Uebergriff zwischen Mandaten wuerde wie ein harmloser UID-Irrlaeufer aussehen.",
      datei: `${KAL}/termin-zustand.js`,
      von: 'begruendung: "Mandat des Eingangs passt nicht zum vorhandenen Termin" };',
      nach: 'begruendung: "Datensatz passt nicht" };'
    }
  ]
});
