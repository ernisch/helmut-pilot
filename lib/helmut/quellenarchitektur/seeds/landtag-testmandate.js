"use strict";

// Helmut — Sprint "Berlin/Brandenburg-Vorrat" (2026-08-18): ZWANZIG SYNTHETISCHE, DEAKTIVIERTE
// Landtags-Testmandate (12 Berlin, 8 Brandenburg) als reine Offline-Daten fuer eine SPAETERE,
// freigabepflichtige kontrollierte Stufe mit insgesamt 25 Mandaten (5 Bestand + 20 neu).
// =============================================================================================
// REINE DATEN + REINE HELFER. Kein DB-Zugriff, kein Netz, keine Aktivierung, KEIN Import beim
// Merge. Diese Datei LEGT KEIN PROFIL AN und aendert keinen Laufzeitpfad.
//
// VERBINDLICHE TRENNUNG (Auftrag 2026-08-18):
//   * ALLE zwanzig Profile sind SYNTHETISCH (synthetisch: true) — KEINE reale Person, kein
//     realer Name, kein reales Einzelmandat. Anders als seeds/bundestag-testmandate.js (reale,
//     belegte MdB) ist das hier BEWUSST: die Wahl zum 20. Abgeordnetenhaus von Berlin ist
//     amtlich auf den 20.09.2026 festgesetzt — real ausgewaehlte Berliner MdA der 19. WP
//     waeren binnen Wochen veraltet, und die byte-genaue Verifikation amtlicher Profilseiten
//     ist aus dieser Umgebung gesperrt (Egress-403, belegt u. a. in
//     docs/quellenarchitektur/13-landesmodule-technische-pruefung-und-bundeswege.md).
//     Die Auswahl realer Personen ist ein eigener, spaeterer Schritt mit eigener Verifikation.
//   * Alle zwanzig Profile sind DEAKTIVIERT (profileActive: false): sie nehmen an keiner
//     Verarbeitung teil und tragen 0 zur Paket-Referenzzaehlung bei
//     (profile-packages.isActivationEligible -> validateProfile -> "deaktiviert").
//   * KEINE Benutzerkonten: keine E-Mail, kein Passwort, keine Einladung, kein Tenant.
//
// FACHLICHE MISCHUNG (ohne politische Bewertung): die Verteilung folgt der amtlichen
// Zusammensetzung beider Parlamente (seeds/parlamentszusammensetzung.js) und dem Ziel
// moeglichst breiter Abdeckung von Fraktionen, Ausschuessen, Themen und Regionen:
//   * Berlin 12 / Brandenburg 8 — Begruendung: groesseres Parlament (159 vs. 88 Sitze),
//     5 vs. 4 Fraktionen, und die Berliner Quellenlage ist weiter (Aktivierungsreife erreicht,
//     berlin-basis in Production aktiv+neutral; Brandenburg zusaetzlich durch den fehlenden
//     PARDOK-Live-Ingest blockiert).
//   * Berlin: CDU 3 · SPD 2 · Gruene 2 · Die Linke 2 · AfD 2 · Fraktionslos 1 —
//     jede Fraktion der 19. WP vertreten, grob proportional zur Sitzverteilung, plus der
//     Sonderpfad "fraktionslos" (profile-validation: partei_oder_fraktionslos).
//   * Brandenburg: SPD 2 · AfD 2 · BSW 2 · CDU 2 — jede Fraktion der 8. WP vertreten.
//     Die Linke hat in der 8. WP KEIN Landtagsmandat (Sollmenge) — deshalb bewusst KEIN
//     Brandenburger Linke-Testmandat und nie `die-linke-brandenburg`.
//   * 18 verschiedene Ausschuesse (10 AGH + 8 Landtag), Stadtstaat- und Flaechenland-Regionen (Bezirke bzw.
//     kreisfreie Staedte + Landkreise), Direkt- und Listenmandate (synthetisch markiert).
//
// AUSSCHUSS-BELEGE: Die Ausschusslisten beider Parlamente sind ueber die offiziellen Seiten
// belegt (Abrufdatum 2026-08-18, per Suchtreffer der amtlichen Seiten; Direktabruf aus dieser
// Umgebung gesperrt). Fachpolitische Schwerpunkte sind redaktionelle TESTANNAHMEN zur
// Personalisierung — keine amtliche Angabe.

const PRUEFDATUM = "2026-08-18";
const WAHLPERIODE_BERLIN = 19;
const WAHLPERIODE_BRANDENBURG = 8;

// --- Belegte Ausschuss-Teilmengen je Parlament ------------------------------------------------
// KEINE Vollzaehligkeits-Sollmenge (anders als seeds/bundestag-ausschuesse.js): gefuehrt sind
// nur die hier verwendeten Ausschuesse, jeder mit amtlicher Fundstelle.
const BERLIN_AUSSCHUESSE_19 = Object.freeze([
  Object.freeze({ name: "Hauptausschuss", beleg: "parlament-berlin.de/Ausschuesse/19-hauptausschuss" }),
  Object.freeze({ name: "Ausschuss für Inneres, Sicherheit und Ordnung", beleg: "parlament-berlin.de/Ausschuesse/19-ausschuss-fur-inneres-sicherheit-und-ordnung" }),
  Object.freeze({ name: "Ausschuss für Bildung, Jugend und Familie", beleg: "parlament-berlin.de/Ausschuesse/19-ausschuss-fur-bildung-jugend-und-familie" }),
  Object.freeze({ name: "Ausschuss für Gesundheit und Pflege", beleg: "parlament-berlin.de/Ausschuesse/19-ausschuss-fur-gesundheit-und-pflege" }),
  Object.freeze({ name: "Ausschuss für Wirtschaft, Energie und Betriebe", beleg: "parlament-berlin.de/Meldungen/die-fachausschusse-der-19-wahlperiode-nach-der-wiederholungswahl" }),
  Object.freeze({ name: "Ausschuss für Stadtentwicklung, Bauen und Wohnen", beleg: "parlament-berlin.de/Ausschuesse/19-ausschuss-fur-stadtentwicklung-bauen-und-wohnen" }),
  Object.freeze({ name: "Ausschuss für Umwelt- und Klimaschutz", beleg: "parlament-berlin.de/Ausschuesse/19-ausschuss-fur-umwelt-und-klimaschutz" }),
  Object.freeze({ name: "Ausschuss für Wissenschaft und Forschung", beleg: "parlament-berlin.de/Ausschuesse/19-ausschuss-fur-wissenschaft-und-forschung" }),
  Object.freeze({ name: "Ausschuss für Verfassungs- und Rechtsangelegenheiten, Geschäftsordnung, Verbraucherschutz", beleg: "parlament-berlin.de/Ausschuesse/19-ausschuss-fur-verfassungs-und-rechtsangelegenheiten-geschaftsordnung-verbraucherschutz" }),
  Object.freeze({ name: "Ausschuss für Verfassungsschutz", beleg: "parlament-berlin.de/Ausschuesse/19-ausschuss-fur-verfassungsschutz" })
]);

const BRANDENBURG_AUSSCHUESSE_8 = Object.freeze([
  Object.freeze({ name: "Ausschuss für Inneres und Kommunales", beleg: "landtag.brandenburg.de/de/meldungen/landtag_brandenburg_setzt_ausschuesse_fuer_die_8._legislaturperiode_ein/41555" }),
  Object.freeze({ name: "Ausschuss für Bildung, Jugend und Sport", beleg: "landtag.brandenburg.de/de/meldungen/landtag_brandenburg_setzt_ausschuesse_fuer_die_8._legislaturperiode_ein/41555" }),
  Object.freeze({ name: "Ausschuss für Gesundheit und Soziales", beleg: "landtag.brandenburg.de/de/meldungen/landtag_brandenburg_setzt_ausschuesse_fuer_die_8._legislaturperiode_ein/41555" }),
  Object.freeze({ name: "Ausschuss für Wirtschaft, Arbeit, Energie und Klimaschutz", beleg: "landtag.brandenburg.de/de/meldungen/landtag_brandenburg_setzt_ausschuesse_fuer_die_8._legislaturperiode_ein/41555" }),
  Object.freeze({ name: "Ausschuss für Land- und Ernährungswirtschaft, Umwelt und Verbraucherschutz", beleg: "landtag.brandenburg.de/de/meldungen/landtag_brandenburg_setzt_ausschuesse_fuer_die_8._legislaturperiode_ein/41555" }),
  Object.freeze({ name: "Ausschuss für Infrastruktur und Landesplanung", beleg: "landtag.brandenburg.de/de/meldungen/landtag_brandenburg_setzt_ausschuesse_fuer_die_8._legislaturperiode_ein/41555" }),
  Object.freeze({ name: "Ausschuss für Haushalt und Finanzen", beleg: "landtag.brandenburg.de/de/meldungen/landtag_brandenburg_setzt_ausschuesse_fuer_die_8._legislaturperiode_ein/41555" }),
  Object.freeze({ name: "Ausschuss für Europaangelegenheiten und Entwicklungspolitik", beleg: "landtag.brandenburg.de/de/meldungen/landtag_brandenburg_setzt_ausschuesse_fuer_die_8._legislaturperiode_ein/41555" })
]);

// --- Bauhelfer (haelt die 20 Eintraege formgleich und kurz) -----------------------------------
function mandat({ id, name, land, partei, ausschuesse, themen, prioritaeten, wahlkreis, regionen, mandatsart, testnutzen }) {
  return Object.freeze({
    id,
    fullName: name,
    party: partei,
    faction: partei === "Fraktionslos" ? "" : partei,
    parliamentType: "Landtag",
    politicalLevel: "Land",
    politische_ebene: "landtag",
    state: land,
    bundesland: land,
    constituency: wahlkreis,
    committees: Object.freeze(ausschuesse.slice()),
    focusTopics: Object.freeze(themen.slice()),        // redaktionelle Testannahme
    topicPriorities: Object.freeze({ ...prioritaeten }),
    regionalInterests: Object.freeze(regionen.slice()),
    profileActive: false,
    internesTestmandat: true,
    synthetisch: true, // KEINE reale Person — Name und Wahlkreis sind erkennbar Testdaten
    herkunft: Object.freeze({
      mandatsart,
      testnutzen,
      hinweis: "Synthetische Identitaet — keine reale Person, kein reales Einzelmandat. "
        + "Fraktionen und Ausschuesse sind amtlich belegt (Parlaments-Sollmenge bzw. Ausschussliste), "
        + "die Person ist erfunden und als Testmandat benannt.",
      belege: Object.freeze([
        land === "Berlin"
          ? "Fraktionen: seeds/parlamentszusammensetzung.js ABGEORDNETENHAUS_BERLIN_19 (Wiederholungswahl 12.02.2023)"
          : "Fraktionen: seeds/parlamentszusammensetzung.js LANDTAG_BRANDENBURG_8 (LTW 22.09.2024)",
        "Ausschuesse: siehe BERLIN_AUSSCHUESSE_19 / BRANDENBURG_AUSSCHUESSE_8 in dieser Datei"
      ]),
      abrufdatum: PRUEFDATUM
    })
  });
}

// --- Berlin: 12 Testmandate (Abgeordnetenhaus, 19. WP) ----------------------------------------
const BERLIN_TESTMANDATE = Object.freeze([
  mandat({
    id: "test-mda-be-01", name: "Testmandat BE-01 (synthetisch)", land: "Berlin", partei: "CDU",
    ausschuesse: ["Hauptausschuss"], themen: ["Landeshaushalt", "Finanzen"],
    prioritaeten: { Landeshaushalt: 5, Finanzen: 4 },
    wahlkreis: "Berlin Steglitz-Zehlendorf (Testwahlkreis, synthetisch)",
    regionen: ["Steglitz-Zehlendorf", "Berlin"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Haushaltspolitik · Hauptausschuss (Querschnitt) · Direktmandat Stadtstaat"
  }),
  mandat({
    id: "test-mda-be-02", name: "Testmandat BE-02 (synthetisch)", land: "Berlin", partei: "CDU",
    ausschuesse: ["Ausschuss für Inneres, Sicherheit und Ordnung"], themen: ["Innere Sicherheit", "Polizei"],
    prioritaeten: { "Innere Sicherheit": 5, Polizei: 4 },
    wahlkreis: "Berlin Spandau (Testwahlkreis, synthetisch)",
    regionen: ["Spandau", "Berlin"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Innenpolitik — derselbe Fachraum wie der E2E-Goldfall (Ausschuss real, 26A)"
  }),
  mandat({
    id: "test-mda-be-03", name: "Testmandat BE-03 (synthetisch)", land: "Berlin", partei: "CDU",
    ausschuesse: ["Ausschuss für Stadtentwicklung, Bauen und Wohnen"], themen: ["Stadtentwicklung", "Bauen"],
    prioritaeten: { Stadtentwicklung: 5, Bauen: 4 },
    wahlkreis: "Berlin Marzahn-Hellersdorf (Testwahlkreis, synthetisch)",
    regionen: ["Marzahn-Hellersdorf", "Berlin"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "Stadtentwicklung/Bauen · Ostbezirk · Listenmandat"
  }),
  mandat({
    id: "test-mda-be-04", name: "Testmandat BE-04 (synthetisch)", land: "Berlin", partei: "SPD",
    ausschuesse: ["Ausschuss für Bildung, Jugend und Familie"], themen: ["Bildung", "Jugend"],
    prioritaeten: { Bildung: 5, Jugend: 4 },
    wahlkreis: "Berlin Neukölln (Testwahlkreis, synthetisch)",
    regionen: ["Neukölln", "Berlin"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Bildungspolitik · Innenstadtbezirk"
  }),
  mandat({
    id: "test-mda-be-05", name: "Testmandat BE-05 (synthetisch)", land: "Berlin", partei: "SPD",
    ausschuesse: ["Ausschuss für Gesundheit und Pflege"], themen: ["Gesundheit", "Pflege"],
    prioritaeten: { Gesundheit: 5, Pflege: 5 },
    wahlkreis: "Berlin Mitte (Testwahlkreis, synthetisch)",
    regionen: ["Mitte", "Berlin"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "Gesundheit/Pflege — Pflege ist zugleich Sozialbegriff (arbeit-und-soziales-Zuordnung erwartbar, Trennschaerfe-Testfall)"
  }),
  mandat({
    id: "test-mda-be-06", name: "Testmandat BE-06 (synthetisch)", land: "Berlin", partei: "Bündnis 90/Die Grünen",
    ausschuesse: ["Ausschuss für Umwelt- und Klimaschutz"], themen: ["Klimaschutz", "Umwelt"],
    prioritaeten: { Klimaschutz: 5, Umwelt: 4 },
    wahlkreis: "Berlin Friedrichshain-Kreuzberg (Testwahlkreis, synthetisch)",
    regionen: ["Friedrichshain-Kreuzberg", "Berlin"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Umwelt-/Klimapolitik"
  }),
  mandat({
    id: "test-mda-be-07", name: "Testmandat BE-07 (synthetisch)", land: "Berlin", partei: "Bündnis 90/Die Grünen",
    ausschuesse: ["Ausschuss für Wissenschaft und Forschung"], themen: ["Wissenschaft", "Hochschulen"],
    prioritaeten: { Wissenschaft: 5, Hochschulen: 4 },
    wahlkreis: "Berlin Charlottenburg-Wilmersdorf (Testwahlkreis, synthetisch)",
    regionen: ["Charlottenburg-Wilmersdorf", "Berlin"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "Wissenschaftspolitik"
  }),
  mandat({
    id: "test-mda-be-08", name: "Testmandat BE-08 (synthetisch)", land: "Berlin", partei: "Die Linke",
    ausschuesse: ["Ausschuss für Stadtentwicklung, Bauen und Wohnen"], themen: ["Mieten", "Wohnen"],
    prioritaeten: { Mieten: 5, Wohnen: 5 },
    wahlkreis: "Berlin Lichtenberg (Testwahlkreis, synthetisch)",
    regionen: ["Lichtenberg", "Berlin"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Linke-Profil MIT Landes-Parteipaket (die-linke-berlin) · geteilter Ausschuss mit BE-03 (zwei Fraktionen, ein Ausschuss)"
  }),
  mandat({
    id: "test-mda-be-09", name: "Testmandat BE-09 (synthetisch)", land: "Berlin", partei: "Die Linke",
    ausschuesse: ["Ausschuss für Verfassungs- und Rechtsangelegenheiten, Geschäftsordnung, Verbraucherschutz"],
    themen: ["Recht", "Verbraucherschutz"],
    prioritaeten: { Recht: 4, Verbraucherschutz: 4 },
    wahlkreis: "Berlin Pankow (Testwahlkreis, synthetisch)",
    regionen: ["Pankow", "Berlin"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "zweites Linke-Profil (Parteipaket-Referenzzaehlung > 1)"
  }),
  mandat({
    id: "test-mda-be-10", name: "Testmandat BE-10 (synthetisch)", land: "Berlin", partei: "AfD",
    ausschuesse: ["Ausschuss für Wirtschaft, Energie und Betriebe"], themen: ["Wirtschaft", "Energie"],
    prioritaeten: { Wirtschaft: 5, Energie: 4 },
    wahlkreis: "Berlin Treptow-Köpenick (Testwahlkreis, synthetisch)",
    regionen: ["Treptow-Köpenick", "Berlin"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "Wirtschaftspolitik"
  }),
  mandat({
    id: "test-mda-be-11", name: "Testmandat BE-11 (synthetisch)", land: "Berlin", partei: "AfD",
    ausschuesse: ["Ausschuss für Verfassungsschutz"], themen: ["Verfassungsschutz"],
    prioritaeten: { Verfassungsschutz: 4 },
    wahlkreis: "Berlin Reinickendorf (Testwahlkreis, synthetisch)",
    regionen: ["Reinickendorf", "Berlin"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "verfassungsmaessig vorgeschriebener Ausschuss (Sondergremium mit Pflichtcharakter)"
  }),
  mandat({
    id: "test-mda-be-12", name: "Testmandat BE-12 (synthetisch)", land: "Berlin", partei: "Fraktionslos",
    ausschuesse: [], themen: ["Landespolitik Berlin", "Bezirkspolitik"],
    prioritaeten: { "Landespolitik Berlin": 4, Bezirkspolitik: 3 },
    wahlkreis: "Berlin Tempelhof-Schöneberg (Testwahlkreis, synthetisch)",
    regionen: ["Tempelhof-Schöneberg", "Berlin"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Sonderpfad fraktionslos (partei_oder_fraktionslos) · kein Ausschuss, Schwerpunkte tragen (schwerpunkt_oder_ausschuss) · kein Parteipaket"
  })
]);

// --- Brandenburg: 8 Testmandate (Landtag, 8. WP) ----------------------------------------------
const BRANDENBURG_TESTMANDATE = Object.freeze([
  mandat({
    id: "test-mdl-bb-01", name: "Testmandat BB-01 (synthetisch)", land: "Brandenburg", partei: "SPD",
    ausschuesse: ["Ausschuss für Inneres und Kommunales"], themen: ["Kommunales", "Innere Sicherheit"],
    prioritaeten: { Kommunales: 5, "Innere Sicherheit": 4 },
    wahlkreis: "Potsdam (Testwahlkreis, synthetisch)",
    regionen: ["Potsdam", "Brandenburg"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Innen-/Kommunalpolitik — derselbe Fachraum wie der E2E-Goldfall (27A, inkl. Stammkollision mit dem Berliner Innenausschuss)"
  }),
  mandat({
    id: "test-mdl-bb-02", name: "Testmandat BB-02 (synthetisch)", land: "Brandenburg", partei: "SPD",
    ausschuesse: ["Ausschuss für Bildung, Jugend und Sport"], themen: ["Bildung", "Sport"],
    prioritaeten: { Bildung: 5, Sport: 3 },
    wahlkreis: "Landkreis Oberhavel (Testwahlkreis, synthetisch)",
    regionen: ["Oberhavel", "Brandenburg"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "Bildungspolitik im Flaechenland"
  }),
  mandat({
    id: "test-mdl-bb-03", name: "Testmandat BB-03 (synthetisch)", land: "Brandenburg", partei: "AfD",
    ausschuesse: ["Ausschuss für Wirtschaft, Arbeit, Energie und Klimaschutz"], themen: ["Wirtschaft", "Strukturwandel Lausitz"],
    prioritaeten: { Wirtschaft: 5, "Strukturwandel Lausitz": 5 },
    wahlkreis: "Landkreis Spree-Neiße (Testwahlkreis, synthetisch)",
    regionen: ["Spree-Neiße", "Lausitz", "Brandenburg"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Wirtschaft/Arbeit/Energie — Ausschussname enthaelt 'Arbeit', zieht aber gemessen KEIN arbeit-und-soziales-Paket (normalizeCommittee ordnet ihn nicht dem Sozialausschuss zu; Trennschaerfe-Testfall)"
  }),
  mandat({
    id: "test-mdl-bb-04", name: "Testmandat BB-04 (synthetisch)", land: "Brandenburg", partei: "AfD",
    ausschuesse: ["Ausschuss für Infrastruktur und Landesplanung"], themen: ["Infrastruktur", "Verkehr"],
    prioritaeten: { Infrastruktur: 5, Verkehr: 4 },
    wahlkreis: "Landkreis Märkisch-Oderland (Testwahlkreis, synthetisch)",
    regionen: ["Märkisch-Oderland", "Brandenburg"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "Infrastruktur/Landesplanung"
  }),
  mandat({
    id: "test-mdl-bb-05", name: "Testmandat BB-05 (synthetisch)", land: "Brandenburg", partei: "BSW",
    ausschuesse: ["Ausschuss für Gesundheit und Soziales"], themen: ["Gesundheit", "Soziales"],
    prioritaeten: { Gesundheit: 5, Soziales: 5 },
    wahlkreis: "Cottbus (Testwahlkreis, synthetisch)",
    regionen: ["Cottbus", "Brandenburg"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "BSW-Fraktion (existiert NUR im Landtag Brandenburg, nicht im Bundestag — Fraktions-Sollmengen-Testfall) · Sozialausschuss → arbeit-und-soziales erwartbar"
  }),
  mandat({
    id: "test-mdl-bb-06", name: "Testmandat BB-06 (synthetisch)", land: "Brandenburg", partei: "BSW",
    ausschuesse: ["Ausschuss für Europaangelegenheiten und Entwicklungspolitik"], themen: ["Europa", "Entwicklungspolitik"],
    prioritaeten: { Europa: 4, Entwicklungspolitik: 3 },
    wahlkreis: "Frankfurt (Oder) (Testwahlkreis, synthetisch)",
    regionen: ["Frankfurt (Oder)", "Brandenburg"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "Europapolitik · Grenzregion"
  }),
  mandat({
    id: "test-mdl-bb-07", name: "Testmandat BB-07 (synthetisch)", land: "Brandenburg", partei: "CDU",
    ausschuesse: ["Ausschuss für Haushalt und Finanzen"], themen: ["Landeshaushalt", "Finanzen"],
    prioritaeten: { Landeshaushalt: 5, Finanzen: 4 },
    wahlkreis: "Landkreis Potsdam-Mittelmark (Testwahlkreis, synthetisch)",
    regionen: ["Potsdam-Mittelmark", "Brandenburg"], mandatsart: "Direktmandat (synthetisch)",
    testnutzen: "Haushaltspolitik (Gegenstueck zu BE-01 — gleiche Fachpolitik, anderes Land: Trennungsnachweis)"
  }),
  mandat({
    id: "test-mdl-bb-08", name: "Testmandat BB-08 (synthetisch)", land: "Brandenburg", partei: "CDU",
    ausschuesse: ["Ausschuss für Land- und Ernährungswirtschaft, Umwelt und Verbraucherschutz"], themen: ["Landwirtschaft", "Umwelt"],
    prioritaeten: { Landwirtschaft: 5, Umwelt: 4 },
    wahlkreis: "Landkreis Uckermark (Testwahlkreis, synthetisch)",
    regionen: ["Uckermark", "Brandenburg"], mandatsart: "Landesliste (synthetisch)",
    testnutzen: "Landwirtschaft/Umwelt — laendlicher Raum (existiert als Fachraum im Stadtstaat Berlin nicht: Kontrastfall)"
  })
]);

const TESTMANDATE = Object.freeze([...BERLIN_TESTMANDATE, ...BRANDENBURG_TESTMANDATE]);

// Kennungen bestehender Mandate/Profile (nur Kennungen, keine Profildaten) fuer die
// Kollisionspruefung. Quelle: seeds/bundestag-testmandate.js (BESTANDSMANDATE_IDS, rein lesende
// Bestandspruefung 2026-08-04) + die dokumentierten deaktivierten Profile + das Berliner
// Abnahmeprofil (seeds/berlin-profilplan.js).
const FREMDE_IDS = Object.freeze([
  "annika-klose", "cem-ince", "helmut-kleebank", "max-mustermann",
  "ottilie-paola-klein-2", "ruppert-st-we",
  "angela-merkel", "james-brown", "helmut-abnahme-berlin",
  "test-mdb-andrea-lindholz", "test-mdb-bernd-baumann", "test-mdb-ralf-stegner",
  "test-mdb-julia-verlinden", "test-mdb-soeren-pellmann"
]);

// --- Normalisierung: gemappte Form -> die zwei Production-Zeilen ------------------------------
// Nachgebildet nach storage.fromMandateProfileRow (vgl. seeds/berlin-profilplan.js P-2):
// ein Landtagsprofil braucht ZWEI Zeilen — `profiles` (Name, fuer Radar) + `mandate_profiles`
// (alles Uebrige). Diese Funktion beschreibt die Zeilen, sie legt NICHTS an.
function zuProductionZeilen(t) {
  return Object.freeze({
    profiles: Object.freeze({ id: t.id, name: t.fullName }),
    mandate_profiles: Object.freeze({
      user_id: t.id,
      politische_ebene: "landtag",
      bundesland: t.bundesland,
      partei: t.party,
      wahlkreis: t.constituency,
      ausschuesse: Object.freeze([...t.committees]),
      fachpolitische_schwerpunkte: Object.freeze([...t.focusTopics]),
      regionale_interessen: Object.freeze([...t.regionalInterests]),
      // WICHTIG: deaktiviert angelegt — Aktivierung ist eine eigene, freigabepflichtige
      // Betreiberentscheidung (Riegel 1b/4 der Landesmodul-Sperre).
      aktiv: false,
      onboarding_status: "neu"
    })
  });
}

// Nur fuer TESTS: aktivierte Kopie (profileActive: true). Diese Funktion existiert, damit die
// Suiten die spaetere Aktivierungswirkung beweisen koennen, OHNE dass die Seed-Daten selbst je
// aktiv sind. Sie schreibt nichts und wird von keinem Laufzeitpfad importiert.
function aktivierteKopie(t) {
  return Object.freeze({ ...t, profileActive: true });
}

// --- Selbstschutz der Datei -------------------------------------------------------------------
// Wird von scripts/landtag-testmandate-test.js ausgefuehrt (kein Laufzeit-Import).
function validateLandtagTestmandate(deps = {}) {
  // Abhaengigkeiten injizierbar (Testbarkeit); Default: die echten Sollmengen und die
  // echte Mandatsliste. `deps.mandate` erlaubt Mutations-Gegenproben, ohne die
  // eingefrorenen Seed-Daten zu veraendern.
  const { fraktionsLage } = deps.parlamente
    || require("./parlamentszusammensetzung");
  const MANDATE = Array.isArray(deps.mandate) ? deps.mandate : TESTMANDATE;
  const fehler = [];
  const ids = new Set();
  const parlamentVon = { Berlin: "abgeordnetenhaus-berlin", Brandenburg: "landtag-brandenburg" };
  const wpVon = { Berlin: WAHLPERIODE_BERLIN, Brandenburg: WAHLPERIODE_BRANDENBURG };
  const ausschussSollVon = {
    Berlin: new Set(BERLIN_AUSSCHUESSE_19.map((a) => a.name)),
    Brandenburg: new Set(BRANDENBURG_AUSSCHUESSE_8.map((a) => a.name))
  };
  const parteiKey = (p) => String(p || "").toLowerCase()
    .replace(/^die /, "").replace(/bündnis 90\/die grünen/i, "gruene")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").trim();

  for (const t of MANDATE) {
    if (!/^test-(mda-be|mdl-bb)-[0-9]{2}$/.test(t.id)) fehler.push(`Kennung ohne Testpraefix: ${t.id}`);
    if (ids.has(t.id)) fehler.push(`doppelte Kennung: ${t.id}`);
    ids.add(t.id);
    if (FREMDE_IDS.includes(t.id)) fehler.push(`Kollision mit bestehender Kennung: ${t.id}`);
    if (t.profileActive !== false) fehler.push(`nicht deaktiviert: ${t.id}`);
    if (t.internesTestmandat !== true) fehler.push(`nicht als internes Testmandat markiert: ${t.id}`);
    if (t.synthetisch !== true) fehler.push(`nicht als synthetisch markiert: ${t.id}`);
    if (!/synthetisch/i.test(t.fullName)) fehler.push(`Name nicht erkennbar synthetisch: ${t.id}`);
    if (!/synthetisch/i.test(t.constituency)) fehler.push(`Wahlkreis nicht erkennbar synthetisch: ${t.id}`);
    if (t.parliamentType !== "Landtag" || t.politische_ebene !== "landtag") fehler.push(`keine Landtagsklassifizierung: ${t.id}`);
    if (t.bundesland !== "Berlin" && t.bundesland !== "Brandenburg") fehler.push(`unbekanntes Bundesland: ${t.id}`);
    for (const feld of ["email", "password", "passwordHash", "inviteUrl"]) {
      if (feld in t) fehler.push(`Konto-/Auth-Feld im Mandatsprofil: ${t.id}.${feld}`);
    }
    if (!t.herkunft || !Array.isArray(t.herkunft.belege) || !t.herkunft.belege.length || !t.herkunft.abrufdatum) {
      fehler.push(`Herkunft/Belege/Abrufdatum fehlen: ${t.id}`);
    }
    // Partei muss im jeweiligen Parlament tatsaechlich Mandate haben (Sollmenge) — oder
    // ausdruecklich "Fraktionslos" sein. Verhindert z. B. ein Linke-Testmandat im Landtag
    // Brandenburg (8. WP: nicht vertreten) oder ein FDP-Testmandat im AGH nach der
    // Wiederholungswahl.
    if (t.party !== "Fraktionslos") {
      const lage = fraktionsLage({ parlament: parlamentVon[t.bundesland], wahlperiode: wpVon[t.bundesland], partei: parteiKey(t.party) });
      if (!lage.bekannt) fehler.push(`Parlaments-Sollmenge unbekannt fuer ${t.id} (${t.bundesland})`);
      else if (!lage.hatMandate) fehler.push(`Partei ohne Mandat im Parlament: ${t.id} (${t.party}, ${t.bundesland})`);
    }
    // Jeder genannte Ausschuss muss in der belegten Ausschussliste des Landes stehen.
    for (const a of t.committees) {
      if (!ausschussSollVon[t.bundesland].has(a)) fehler.push(`unbelegter Ausschuss: ${t.id} — ${a}`);
    }
    // Ohne Ausschuss muessen Schwerpunkte tragen (profile-validation: schwerpunkt_oder_ausschuss).
    if (!t.committees.length && !t.focusTopics.length) fehler.push(`weder Ausschuss noch Schwerpunkt: ${t.id}`);
  }

  // Verteilung: genau 12 Berlin + 8 Brandenburg, jede Fraktion beider Parlamente vertreten.
  const be = MANDATE.filter((t) => t.bundesland === "Berlin");
  const bb = MANDATE.filter((t) => t.bundesland === "Brandenburg");
  if (be.length !== 12) fehler.push(`Berlin: ${be.length} statt 12`);
  if (bb.length !== 8) fehler.push(`Brandenburg: ${bb.length} statt 8`);
  const beParteien = new Set(be.map((t) => parteiKey(t.party)));
  for (const k of ["cdu", "spd", "gruene", "linke", "afd"]) {
    if (!beParteien.has(k)) fehler.push(`Berlin: Fraktion ${k} nicht vertreten`);
  }
  const bbParteien = new Set(bb.map((t) => parteiKey(t.party)));
  for (const k of ["spd", "afd", "bsw", "cdu"]) {
    if (!bbParteien.has(k)) fehler.push(`Brandenburg: Fraktion ${k} nicht vertreten`);
  }
  if (bbParteien.has("linke")) fehler.push("Brandenburg: Linke-Testmandat, obwohl in der 8. WP nicht vertreten");

  return { ok: fehler.length === 0, fehler };
}

module.exports = {
  PRUEFDATUM,
  WAHLPERIODE_BERLIN,
  WAHLPERIODE_BRANDENBURG,
  BERLIN_AUSSCHUESSE_19,
  BRANDENBURG_AUSSCHUESSE_8,
  BERLIN_TESTMANDATE,
  BRANDENBURG_TESTMANDATE,
  TESTMANDATE,
  FREMDE_IDS,
  zuProductionZeilen,
  aktivierteKopie,
  validateLandtagTestmandate
};
