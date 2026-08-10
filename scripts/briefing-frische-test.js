"use strict";

// Helmut — Abnahmetests des FRISCHEVERTRAGS für das morgendliche Briefing.
// =============================================================================
// KEIN Netz, KEINE KI, KEINE Datenbank. Geprüft wird der Vertrag selbst
// (`lib/helmut/briefing-frische.js`) und sein Beleg (`lib/helmut/briefing-lauf.js`)
// gegen die zehn Abnahmekriterien des Sprints:
//
//   A) Jeder Berliner Kalendertag braucht einen eigenen, belegten Lauf.
//   B) Ein Briefing vom Vortag gilt nie als heutiges.
//   C) Neu = seit dem letzten erfolgreichen Morgenbriefing (inkl. spätem Vorabend),
//      mit unverändertem echtem Datum.
//   D) Ältere Vorgänge nur getrennt als „weiterhin relevant"/„Hintergrund".
//   E) Fehlender/fehlgeschlagener Lauf oder zu alte Daten -> „Briefing noch nicht aktuell".
//   F) Europe/Berlin verbindlich, inkl. Sommer-/Winterzeit und Umstellungstagen.
//   G) Cache/Beleg-Schlüssel folgen demselben Tagesbegriff.
//   H) Sonderfälle: Mitternacht, verspäteter Lauf, zweiter Lauf am selben Tag,
//      teilweise fehlgeschlagene Quellen, keine neuen Meldungen.
//   I) Idempotenz: Wiederholung erkennt sich, ohne zweites Briefing/Push.
//   J) Persistenz wird gegengelesen — ein nicht gespeicherter Erfolg gilt nicht.

const assert = require("assert");
const f = require("../lib/helmut/briefing-frische");
const lauf = require("../lib/helmut/briefing-lauf");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
async function checkAsync(name, fn) {
  try { const ok = await fn(); check(name, ok === true || ok === undefined); }
  catch (error) { failed += 1; console.log(`FAIL  ${name}  — ${error && error.message}`); }
}

// =============================================================================
// F) Zeitzone Europe/Berlin — verbindlich, inklusive Sommerzeit
// =============================================================================

// Winterzeit: Berlin = UTC+1. 2026-01-15T22:59Z ist Berlin 23:59 desselben Tages,
// 23:00Z ist bereits der 16.
check("Winter: 22:59Z -> Berliner Tag 15.", f.berlinTagKey("2026-01-15T22:59:00Z") === "2026-01-15",
  f.berlinTagKey("2026-01-15T22:59:00Z"));
check("Winter: 23:00Z -> Berliner Tag 16. (Tageswechsel)", f.berlinTagKey("2026-01-15T23:00:00Z") === "2026-01-16",
  f.berlinTagKey("2026-01-15T23:00:00Z"));
// Sommerzeit: Berlin = UTC+2. 2026-07-15T21:59Z ist Berlin 23:59, 22:00Z der 16.
check("Sommer: 21:59Z -> Berliner Tag 15.", f.berlinTagKey("2026-07-15T21:59:00Z") === "2026-07-15");
check("Sommer: 22:00Z -> Berliner Tag 16. (Tageswechsel)", f.berlinTagKey("2026-07-15T22:00:00Z") === "2026-07-16");

check("Versatz Winter = +60 min", f.berlinOffsetMinuten("2026-01-15T12:00:00Z") === 60);
check("Versatz Sommer = +120 min", f.berlinOffsetMinuten("2026-07-15T12:00:00Z") === 120);
// Umstellungstage 2026: 29.03. (Beginn Sommerzeit), 25.10. (Ende).
check("Umstellungstag Maerz: vor 01:00Z noch +60", f.berlinOffsetMinuten("2026-03-29T00:30:00Z") === 60);
check("Umstellungstag Maerz: nach 01:00Z schon +120", f.berlinOffsetMinuten("2026-03-29T01:30:00Z") === 120);
check("Umstellungstag Oktober: vor 01:00Z noch +120", f.berlinOffsetMinuten("2026-10-25T00:30:00Z") === 120);
check("Umstellungstag Oktober: nach 01:00Z wieder +60", f.berlinOffsetMinuten("2026-10-25T01:30:00Z") === 60);

// Tagesbeginn (00:00 Berlin) als echter Zeitpunkt — DST-korrekt, nicht als fester Versatz.
check("Tagesbeginn Winter = 23:00Z des Vortags", f.berlinZeitpunkt("2026-01-15", 0, 0).toISOString() === "2026-01-14T23:00:00.000Z",
  f.berlinZeitpunkt("2026-01-15", 0, 0).toISOString());
check("Tagesbeginn Sommer = 22:00Z des Vortags", f.berlinZeitpunkt("2026-07-15", 0, 0).toISOString() === "2026-07-14T22:00:00.000Z",
  f.berlinZeitpunkt("2026-07-15", 0, 0).toISOString());
check("Tagesbeginn am Umstellungstag Maerz = 23:00Z des Vortags", f.berlinZeitpunkt("2026-03-29", 0, 0).toISOString() === "2026-03-28T23:00:00.000Z",
  f.berlinZeitpunkt("2026-03-29", 0, 0).toISOString());
check("Tagesbeginn am Umstellungstag Oktober = 22:00Z des Vortags", f.berlinZeitpunkt("2026-10-25", 0, 0).toISOString() === "2026-10-24T22:00:00.000Z",
  f.berlinZeitpunkt("2026-10-25", 0, 0).toISOString());
// Die nicht existierende Ortszeit 02:30 am 29.03. darf nicht "erfunden" werden:
// das Verfahren liefert einen echten Zeitpunkt (03:30 Ortszeit), keinen Absturz.
const luecke = f.berlinZeitpunkt("2026-03-29", 2, 30);
check("Sommerzeit-Luecke ergibt einen echten Zeitpunkt (kein Crash/NaN)",
  luecke instanceof Date && !Number.isNaN(luecke.getTime()), String(luecke));

check("Tagesverschiebung ueber Monatsgrenze", f.berlinTagVerschieben("2026-03-01", -1) === "2026-02-28");
check("Ungueltiger Wert -> kein Tagesurteil (null)", f.berlinTagKey("keine-zeit") === null);

// Zeitlabel: das TATSAECHLICHE Datum bleibt erhalten (Punkt 3).
const jetztMorgens = new Date("2026-07-15T04:10:00Z"); // Berlin 06:10
check("Vorabendmeldung behaelt ihr Datum ('Gestern, ...')",
  /^Gestern, /.test(f.berlinZeitLabel("2026-07-14T20:40:00Z", jetztMorgens) || ""),
  f.berlinZeitLabel("2026-07-14T20:40:00Z", jetztMorgens));
check("Heutige Meldung heisst 'Heute, ...'",
  /^Heute, /.test(f.berlinZeitLabel("2026-07-15T03:40:00Z", jetztMorgens) || ""));
check("Aeltere Meldung traegt ihr volles Datum",
  /^\d{2}\.\d{2}\.\d{4}, /.test(f.berlinZeitLabel("2026-07-01T09:00:00Z", jetztMorgens) || ""));

// =============================================================================
// C/D) Briefingfenster und Meldungsklassen
// =============================================================================

const gestern0500 = "2026-07-14T05:00:00Z"; // gestriges Morgenbriefing (Berlin 07:00)
const fenster = f.frischeFenster({ jetzt: jetztMorgens, letzterErfolgAt: gestern0500 });
check("Fenster startet beim letzten erfolgreichen Morgenbriefing",
  fenster.start === new Date(gestern0500).toISOString() && fenster.quelle === "letzter-lauf", JSON.stringify(fenster));

// Ohne vorherigen Lauf: Vorabend-Standard (Tagesbeginn minus 8 h = 16:00 Vortag Berlin).
const fensterOhne = f.frischeFenster({ jetzt: jetztMorgens });
check("Ohne Vorlauf: Vorabend-Standard 16:00 Berliner Vortag",
  fensterOhne.start === "2026-07-14T14:00:00.000Z" && fensterOhne.quelle === "vorabend-standard", JSON.stringify(fensterOhne));

// Ein sehr alter letzter Lauf darf das Fenster nicht ins Uferlose oeffnen.
const fensterAlt = f.frischeFenster({ jetzt: jetztMorgens, letzterErfolgAt: "2026-06-01T05:00:00Z" });
check("Sehr alter Vorlauf faellt auf den Vorabend-Standard zurueck",
  fensterAlt.start === "2026-07-14T14:00:00.000Z" && fensterAlt.quelle === "vorabend-standard");

check("Spaete Vorabendmeldung ist NEU",
  f.klassifiziereMeldung("2026-07-14T20:40:00Z", fensterOhne, jetztMorgens) === f.KLASSE_NEU);
check("Meldung von gestern frueh ist NICHT neu (Vorabend-Standard)",
  f.klassifiziereMeldung("2026-07-14T06:00:00Z", fensterOhne, jetztMorgens) === f.KLASSE_WEITERHIN);
check("Meldung seit dem letzten Lauf ist NEU (Fenster aus Quittung)",
  f.klassifiziereMeldung("2026-07-14T06:00:00Z", fenster, jetztMorgens) === f.KLASSE_NEU);
check("Alter Vorgang (30 Tage) ist Hintergrund",
  f.klassifiziereMeldung("2026-06-15T09:00:00Z", fensterOhne, jetztMorgens) === f.KLASSE_HINTERGRUND);
check("Vorgang ohne Datum wird nie zu 'neu' hochgestuft",
  f.klassifiziereMeldung(null, fensterOhne, jetztMorgens) === f.KLASSE_UNDATIERT);

const items = [
  { id: "a", lastUpdated: "2026-07-14T20:40:00Z" },   // spaeter Vorabend -> neu
  { id: "b", lastUpdated: "2026-07-15T03:10:00Z" },   // heute frueh -> neu
  { id: "c", lastUpdated: "2026-07-10T09:00:00Z" },   // 5 Tage alt -> weiterhin relevant
  { id: "d", lastUpdated: "2026-05-02T09:00:00Z" },   // sehr alt -> Hintergrund
  { id: "e" }                                          // ohne Datum
];
const ordnung = f.ordneMeldungen(items, fensterOhne, jetztMorgens);
check("Einordnung: 2 neu / 1 weiterhin / 1 Hintergrund / 1 undatiert",
  ordnung.kennzahlen.neu === 2 && ordnung.kennzahlen.weiterhinRelevant === 1
  && ordnung.kennzahlen.hintergrund === 1 && ordnung.kennzahlen.undatiert === 1,
  JSON.stringify(ordnung.kennzahlen));
check("Einordnung veraendert KEIN Datum",
  ordnung.items.every((it, i) => it.lastUpdated === items[i].lastUpdated));
check("Einordnung entfernt und sortiert nichts um",
  ordnung.items.map((i) => i.id).join(",") === "a,b,c,d,e");
check("Vorabendmeldung traegt weiter ihr echtes Datum als Label",
  /^Gestern, /.test(ordnung.items[0].zeitLabel || ""));
check("Aeltere Vorgaenge tragen eine eigene, getrennte Klasse (Punkt 4)",
  ordnung.items[2].frischeKlasse === f.KLASSE_WEITERHIN && ordnung.items[3].frischeKlasse === f.KLASSE_HINTERGRUND);

// =============================================================================
// A/B/E) Urteil: gilt der gezeigte Stand als HEUTIGES Briefing?
// =============================================================================

const heuteTag = f.berlinTagKey(jetztMorgens);
const guterLauf = {
  vertragVersion: f.VERTRAG_VERSION, berlinTag: heuteTag, status: "erfolg",
  ausloeser: "morgenlauf", erzeugtAm: "2026-07-15T04:00:00Z", fensterStart: fensterOhne.start
};
const frischeDaten = "2026-07-15T03:10:00Z";

let u = f.beurteileFrische({ jetzt: jetztMorgens, lauf: guterLauf, datenstandIso: frischeDaten });
check("A) Heutiger erfolgreicher Lauf + frische Daten -> aktuell", u.aktuell === true && u.grund === f.GRUND.AKTUELL, u.grund);
check("A) Anzeigetext bei aktuell", u.anzeige === "Aktuell");

u = f.beurteileFrische({ jetzt: jetztMorgens, lauf: null, datenstandIso: frischeDaten });
check("E) Fehlender heutiger Lauf -> nicht aktuell", u.aktuell === false && u.grund === f.GRUND.LAUF_FEHLT);
check("E) Anzeigetext ist die ehrliche Ansage", u.anzeige === "Briefing noch nicht aktuell");

u = f.beurteileFrische({ jetzt: jetztMorgens, lauf: { ...guterLauf, status: "fehler" }, datenstandIso: frischeDaten });
check("E) Fehlgeschlagener Lauf -> nicht aktuell", u.aktuell === false && u.grund === f.GRUND.LAUF_FEHLGESCHLAGEN);

u = f.beurteileFrische({
  jetzt: jetztMorgens,
  lauf: { ...guterLauf, berlinTag: "2026-07-14", erzeugtAm: "2026-07-14T04:00:00Z" },
  datenstandIso: frischeDaten
});
check("B) Gestriger Lauf gilt NICHT als heutiges Briefing", u.aktuell === false && u.grund === f.GRUND.LAUF_VERALTET);

u = f.beurteileFrische({ jetzt: jetztMorgens, lauf: guterLauf, datenstandIso: "2026-07-13T03:10:00Z" });
check("E) Zu alte Daten (>24 h) -> nicht aktuell", u.aktuell === false && u.grund === f.GRUND.DATEN_VERALTET, String(u.datenAlterStunden));

u = f.beurteileFrische({ jetzt: jetztMorgens, lauf: guterLauf, datenstandIso: null });
check("E) Unbekannter Datenstand -> nicht aktuell", u.aktuell === false && u.grund === f.GRUND.DATENSTAND_UNBEKANNT);

u = f.beurteileFrische({ jetzt: jetztMorgens, lauf: { ...guterLauf, vertragVersion: f.VERTRAG_VERSION + 1 }, datenstandIso: frischeDaten });
check("E) Quittung aus neuerer Vertragsversion gilt nicht als Beleg", u.aktuell === false && u.grund === f.GRUND.LAUF_UNBEKANNTE_VERSION);

// Kein Weg fuehrt zu "aktuell" ohne Lauf-Beleg — Gegenprobe ueber alle Varianten.
const ohneBeleg = [null, undefined, {}, { status: "erfolg" }, { berlinTag: heuteTag }];
check("B) KEIN Zustand ohne heutigen Erfolgs-Beleg ergibt 'aktuell'",
  ohneBeleg.every((l) => f.beurteileFrische({ jetzt: jetztMorgens, lauf: l, datenstandIso: frischeDaten }).aktuell === false));

// =============================================================================
// H) Sonderfälle
// =============================================================================

// Lauf über Mitternacht: Start 23:58 Berlin, Ende 00:03 Berlin -> der Beleg gehört
// zu dem Tag, an dem er GESCHRIEBEN wird; ein Beleg von 23:58 gilt am Folgetag nicht.
const kurzNachMitternacht = new Date("2026-07-16T22:05:00Z"); // Berlin 17.07. 00:05
const laufVor = { ...guterLauf, berlinTag: "2026-07-16", erzeugtAm: "2026-07-16T21:58:00Z" };
u = f.beurteileFrische({ jetzt: kurzNachMitternacht, lauf: laufVor, datenstandIso: "2026-07-16T21:00:00Z" });
check("H) Lauf ueber Mitternacht: Beleg von 23:58 zaehlt am neuen Tag nicht",
  u.aktuell === false && u.grund === f.GRUND.LAUF_VERALTET);

// Verspäteter Lauf (z. B. Watchdog um 10:30 Berlin) ist trotzdem der heutige Lauf.
const spaet = new Date("2026-07-15T08:30:00Z");
u = f.beurteileFrische({
  jetzt: spaet,
  lauf: { ...guterLauf, ausloeser: "nachlauf", erzeugtAm: "2026-07-15T08:25:00Z" },
  datenstandIso: "2026-07-15T08:00:00Z"
});
check("H) Verspaeteter Lauf am selben Berliner Tag gilt als heutiges Briefing", u.aktuell === true);

// Teilweise fehlgeschlagene Quellen: aktuell, aber ehrlich benannt.
u = f.beurteileFrische({
  jetzt: jetztMorgens, lauf: guterLauf, datenstandIso: frischeDaten,
  quellen: { geprueft: 40, fehlgeschlagen: 6 }
});
check("H) Teilausfall von Quellen macht das Briefing nicht unaktuell", u.aktuell === true);
check("H) Teilausfall wird ausdruecklich benannt",
  u.quellen && u.quellen.teilausfall === true && /6 von 40/.test(u.quellen.hinweis || ""), JSON.stringify(u.quellen));

// Keine neuen Meldungen: aktuell + Ruhelage (kein Fehler, kein falsches "neu").
const vertragRuhe = f.briefingFrischevertrag({
  jetzt: jetztMorgens, lauf: guterLauf, datenstandIso: frischeDaten,
  items: [{ id: "c", lastUpdated: "2026-07-10T09:00:00Z" }], fenster: fensterOhne
});
check("H) Keine neue Meldung -> aktuell UND Ruhelage",
  vertragRuhe.aktuell === true && vertragRuhe.ruhelage === true && vertragRuhe.kennzahlen.neu === 0);
check("H) Ruhelage benennt die Lage ehrlich", /keine neue Meldung/i.test(vertragRuhe.hinweis || ""));
check("H) Ruhelage stuft den alten Vorgang NICHT zu 'neu' hoch",
  vertragRuhe.kennzahlen.weiterhinRelevant === 1);

// Der Gesamtvertrag übernimmt ein vorgegebenes Fenster unverändert (API == Aufbau).
check("G) Vorgegebenes Fenster wird unveraendert ausgewiesen",
  vertragRuhe.fenster.start === fensterOhne.start);

// =============================================================================
// Not-Aus
// =============================================================================
check("Vertrag ist per Default aktiv", f.vertragAktiv({}) === true);
check("Not-Aus 'off' schaltet den Vertrag ab", f.vertragAktiv({ HELMUT_BRIEFING_FRISCHE: "off" }) === false);
check("Beliebiger anderer Wert laesst den Vertrag aktiv", f.vertragAktiv({ HELMUT_BRIEFING_FRISCHE: "on" }) === true);

// =============================================================================
// I/J) Lauf-Quittung: Idempotenz, getrennte Zeilen, Gegenlesen
// =============================================================================

function speicherAttrappe({ schreibfehler = false, verlierErfolg = false } = {}) {
  const zeilen = new Map();
  return {
    zeilen,
    schreibvorgaenge: 0,
    async getRenderedBriefingV3(userId, slot, day) {
      return zeilen.get(`bf-${userId}-${slot}-${day}`) || null;
    },
    async saveRenderedBriefingV3(entry) {
      this.schreibvorgaenge += 1;
      if (schreibfehler) return { skipped: true, reason: "v3-store-error" };
      if (!(verlierErfolg && entry.slot === lauf.SLOT_ERFOLG)) zeilen.set(entry.id, { ...entry });
      return { saved: true, id: entry.id };
    }
  };
}

const briefingA = {
  available: true,
  currentHelmutState: {
    status: "fresh", primaryVorgangId: "vg-1",
    primaryItem: { id: "vg-1", lastUpdated: "2026-07-15T03:10:00Z" },
    items: [{ id: "vg-2", lastUpdated: "2026-07-14T20:40:00Z" }]
  }
};
const briefingB = JSON.parse(JSON.stringify(briefingA));
briefingB.currentHelmutState.items.push({ id: "vg-3", lastUpdated: "2026-07-15T05:00:00Z" });

check("I) Signatur ist stabil bei gleichem Inhalt",
  lauf.inhaltsSignatur(briefingA) === lauf.inhaltsSignatur(JSON.parse(JSON.stringify(briefingA))));
check("I) Signatur aendert sich bei neuem Vorgang",
  lauf.inhaltsSignatur(briefingA) !== lauf.inhaltsSignatur(briefingB));

(async () => {
  await checkAsync("J) Erfolg wird geschrieben UND gegengelesen", async () => {
    const st = speicherAttrappe();
    const q = lauf.quittung({
      tenantId: "mandat-1", berlinTag: "2026-07-15", status: lauf.STATUS_ERFOLG,
      erzeugtAm: new Date("2026-07-15T04:00:00Z"), fensterStart: fensterOhne.start,
      signatur: lauf.inhaltsSignatur(briefingA)
    });
    const r = await lauf.schreibeQuittung(st, q);
    return r.gespeichert === true && r.verifiziert === true && r.id === "bf-mandat-1-morgenlage-2026-07-15";
  });

  await checkAsync("J) Nicht persistierter Erfolg wird NICHT als Erfolg gemeldet", async () => {
    const st = speicherAttrappe({ verlierErfolg: true });
    const r = await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "mandat-1", berlinTag: "2026-07-15", status: lauf.STATUS_ERFOLG, signatur: "abc"
    }));
    return r.verifiziert === false && Boolean(r.fehler);
  });

  await checkAsync("J) Speicherfehler wird ausdruecklich gemeldet", async () => {
    const st = speicherAttrappe({ schreibfehler: true });
    const r = await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "mandat-1", berlinTag: "2026-07-15", status: lauf.STATUS_ERFOLG
    }));
    return r.gespeichert === false && r.fehler === "v3-store-error";
  });

  await checkAsync("A) Ohne Beleg meldet der Tageslauf ehrlich 'kein Lauf'", async () => {
    const st = speicherAttrappe();
    const r = await lauf.ladeTageslauf(st, "mandat-1", "2026-07-15");
    return r.lauf === null;
  });

  await checkAsync("H/I) Fehlversuch ueberschreibt einen belegten Erfolg NICHT", async () => {
    const st = speicherAttrappe();
    await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "m", berlinTag: "2026-07-15", status: lauf.STATUS_ERFOLG,
      erzeugtAm: new Date("2026-07-15T04:00:00Z"), signatur: "sig-1"
    }));
    await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "m", berlinTag: "2026-07-15", status: lauf.STATUS_FEHLER,
      erzeugtAm: new Date("2026-07-15T06:00:00Z"), grund: "build-timeout"
    }));
    const r = await lauf.ladeTageslauf(st, "m", "2026-07-15");
    return r.quelle === "erfolg" && r.lauf.status === lauf.STATUS_ERFOLG && r.lauf.signatur === "sig-1";
  });

  await checkAsync("E) Fehlversuch ohne Erfolg wird als fehlgeschlagen gemeldet", async () => {
    const st = speicherAttrappe();
    await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "m", berlinTag: "2026-07-15", status: lauf.STATUS_FEHLER, grund: "build-timeout"
    }));
    const r = await lauf.ladeTageslauf(st, "m", "2026-07-15");
    const urteil = f.beurteileFrische({ jetzt: jetztMorgens, lauf: r.lauf, datenstandIso: frischeDaten });
    return r.quelle === "fehler" && urteil.aktuell === false && urteil.grund === f.GRUND.LAUF_FEHLGESCHLAGEN;
  });

  await checkAsync("I) Zweiter Lauf mit gleichem Inhalt ist eine Wiederholung", async () => {
    const st = speicherAttrappe();
    const sig = lauf.inhaltsSignatur(briefingA);
    await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "m", berlinTag: "2026-07-15", status: lauf.STATUS_ERFOLG, signatur: sig,
      fensterStart: fensterOhne.start, erzeugtAm: new Date("2026-07-15T04:00:00Z")
    }));
    const vorher = (await lauf.ladeErfolg(st, "m", "2026-07-15")).lauf;
    const vorherSchreibvorgaenge = st.schreibvorgaenge;
    const wiederholung = lauf.istWiederholung(vorher, sig);
    // Bei erkannter Wiederholung wird NICHT erneut geschrieben.
    return wiederholung === true && st.schreibvorgaenge === vorherSchreibvorgaenge;
  });

  await checkAsync("I) Zweiter Lauf mit NEUEM Inhalt ist keine Wiederholung", async () => {
    const st = speicherAttrappe();
    await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "m", berlinTag: "2026-07-15", status: lauf.STATUS_ERFOLG,
      signatur: lauf.inhaltsSignatur(briefingA)
    }));
    const vorher = (await lauf.ladeErfolg(st, "m", "2026-07-15")).lauf;
    return lauf.istWiederholung(vorher, lauf.inhaltsSignatur(briefingB)) === false;
  });

  await checkAsync("C) Wiederholungslauf behaelt das Fenster des ersten Laufs", async () => {
    const st = speicherAttrappe();
    await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "m", berlinTag: "2026-07-15", status: lauf.STATUS_ERFOLG,
      signatur: "sig", fensterStart: fensterOhne.start, erzeugtAm: new Date("2026-07-15T04:00:00Z")
    }));
    const heutiger = (await lauf.ladeErfolg(st, "m", "2026-07-15")).lauf;
    const zweitesFenster = f.frischeFenster({ jetzt: spaet, letzterErfolgAt: heutiger.fensterStart });
    return zweitesFenster.start === fensterOhne.start;
  });

  await checkAsync("C) Fenster des Folgetags beginnt beim letzten Erfolg", async () => {
    const st = speicherAttrappe();
    await lauf.schreibeQuittung(st, lauf.quittung({
      tenantId: "m", berlinTag: "2026-07-14", status: lauf.STATUS_ERFOLG,
      erzeugtAm: new Date("2026-07-14T04:00:00Z"), signatur: "sig-gestern"
    }));
    const letzter = await lauf.ladeLetztenErfolg(st, "m", "2026-07-15", { maxTage: 2, inklusiveHeute: false });
    const fensterHeute = f.frischeFenster({ jetzt: jetztMorgens, letzterErfolgAt: letzter.erzeugtAm });
    return letzter.erzeugtAm === "2026-07-14T04:00:00.000Z" && fensterHeute.quelle === "letzter-lauf";
  });

  await checkAsync("G) Beleg-Schluessel enthaelt den Berliner Tag", async () => {
    return lauf.laufId("m", "2026-07-15") === "bf-m-morgenlage-2026-07-15"
      && lauf.laufId("m", "2026-07-15", lauf.SLOT_FEHLER) === "bf-m-morgenlage-fehler-2026-07-15";
  });

  await checkAsync("G) Ohne Speicher gibt es keinen erfundenen Beleg", async () => {
    const r = await lauf.ladeTageslauf({}, "m", "2026-07-15");
    return r.lauf === null && r.fehler === "kein-speicher";
  });

  // Die Quittung darf keine Briefingtexte/Quellen-URLs tragen (Datensparsamkeit).
  await checkAsync("Quittung enthaelt keine Inhalte (nur Kennzahlen/Zeiten)", async () => {
    const q = lauf.quittung({
      tenantId: "m", berlinTag: "2026-07-15", status: lauf.STATUS_ERFOLG,
      kennzahlen: { neu: 2 }, signatur: "abc"
    });
    const roh = JSON.stringify(q);
    return !/http|<|Vorgang|Empfehlung/i.test(roh) && Object.keys(q).length <= 14;
  });

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  if (failed > 0) process.exit(1);
  assert.strictEqual(failed, 0);
})();
