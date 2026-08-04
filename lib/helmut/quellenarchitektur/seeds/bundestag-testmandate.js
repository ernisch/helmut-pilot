"use strict";

// Helmut — Sprint "Profilreife" (2026-08-04): FUENF reale, DEAKTIVIERTE Bundestags-
// Testmandate als reine Offline-Daten.
// =============================================================================================
// REINE DATEN + REINE HELFER. Kein DB-Zugriff, kein Netz, keine Aktivierung, KEIN Import beim
// Merge. Diese Datei LEGT KEIN PROFIL AN — sie beschreibt vollstaendig, welche fuenf Profile
// eine spaetere, ausdrueckliche Betreiberentscheidung anlegen und aktivieren koennte
// (Vorbild: seeds/berlin-profilplan.js).
//
// VERBINDLICHE TRENNUNG (Auftrag 2026-08-04):
//   * Das sind MANDATSPROFILE fuer den Datenmotor — KEINE Benutzerkonten. Es gibt keine
//     E-Mail, kein Passwort, keine Einladung, keine Auth-Identitaet und keinen zahlenden
//     Tenant. Die betreffenden Abgeordneten NUTZEN Helmut nicht und duerfen nicht so
//     dargestellt werden.
//   * Alle fuenf Profile sind DEAKTIVIERT (profileActive: false). Sie nehmen an keiner
//     Verarbeitung teil und tragen 0 zur Paket-Referenzzaehlung bei
//     (profile-packages.isActivationEligible -> validateProfile -> "deaktiviert").
//   * Abgrenzung zu scripts/fixtures/test-profiles.js: Die dortige Regel ("Tests verwenden
//     niemals echte Personen") gilt fuer SYNTHETISCHE Test-Identitaeten der Suiten weiter.
//     Diese Datei ist KEIN Test-Identitaeten-Pool, sondern der beauftragte, belegte
//     Provisionierungsplan fuer kontrollierte Tests mit realen Mandaten (Auftrag Phase 7/8);
//     die Auswahl ist dokumentiert in docs/multitenancy-profilbereitschaft-bundestag.md.
//
// AUSWAHLKRITERIEN (Auftrag Phase 7, Stand 2026-08-04): eine Person je Fraktion des
// 21. Bundestages (CDU/CSU, AfD, SPD, Buendnis 90/Die Gruenen, Die Linke — Sollmenge:
// seeds/parlamentszusammensetzung.js), fuenf verschiedene Bundeslaender, verschiedene
// Ausschuesse/Fachbereiche, Direkt- UND Listenmandate, verschiedene politische Rollen,
// verschiedene Geschlechter, keine Auswahl allein nach Bekanntheit. KEINE politische
// Bewertung — die Auswahl behauptet keine Rangfolge zwischen Parteien.
//
// BELEGE: je Profil amtliche/offizielle Fundstellen + Abrufdatum. ABRUFGRENZE (ehrlich
// dokumentiert, wie in seeds/bundestag-ausschuesse.js): Direktabrufe externer Seiten sind
// aus der Arbeitsumgebung gesperrt (HTTP 403 der Egress-Richtlinie); die Verifikation
// erfolgte am 2026-08-04 ueber Suchtreffer der genannten offiziellen Quellen. Angaben, die
// so nicht zweifelsfrei belegbar waren, sind ausdruecklich als "zu bestaetigen" markiert
// statt behauptet. Fachpolitische Schwerpunkte sind als redaktionelle TESTANNAHME aus dem
// oeffentlichen Wirkungsfeld markiert — sie sind Personalisierungs-Testdaten, keine
// amtliche Angabe.

const PRUEFDATUM = "2026-08-04";
const WAHLPERIODE = 21;

// Stabile Testkennungen: Praefix "test-mdb-" verhindert Kollisionen mit bestehenden
// Mandats-Slugs (cem-ince, ...) UND mit personalPackageKeyFor("profil-<slug>") realer
// Pakete. Die Kennzeichnung als internes Testmandat liegt zusaetzlich im Profil selbst
// (internesTestmandat: true -> landet ohne Schemaaenderung in profil_extras).
const TESTMANDATE = Object.freeze([
  Object.freeze({
    id: "test-mdb-andrea-lindholz",
    fullName: "Andrea Lindholz",
    party: "CSU",
    faction: "CDU/CSU",
    function: "Vizepräsidentin des Deutschen Bundestages",
    role: "Vizepräsidentin des Deutschen Bundestages",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    state: "Bayern",
    constituency: "Aschaffenburg",
    // Praesidiumsmitglied — KEINE ordentliche Ausschussmitgliedschaft; als Vizepraesidentin
    // ist sie stellvertretendes Mitglied im Innen- und im Rechtsausschuss (offizielle
    // persoenliche Seite, eindeutiger 21.-WP-Bezug). Ordentlich/stellvertretend strikt
    // getrennt: committees bleibt leer, die Stellvertretungen stehen in deputyCommittees
    // (kanonische WP-21-Bezeichnungen; "Rechtsausschuss" ist die Kurzform des Ausschusses
    // fuer Recht und Verbraucherschutz).
    committees: Object.freeze([]),
    deputyCommittees: Object.freeze(["Innenausschuss", "Ausschuss für Recht und Verbraucherschutz"]),
    focusTopics: Object.freeze(["Innere Sicherheit", "Recht", "Parlament"]), // redaktionelle Testannahme
    topicPriorities: Object.freeze({ "Innere Sicherheit": 5, Recht: 4, Parlament: 4 }),
    regionalInterests: Object.freeze(["Aschaffenburg", "Unterfranken", "Bayern"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Direktmandat Wahlkreis Aschaffenburg (Bundestagswahl 2025, 43,8 % Erststimmen)",
      geschlecht: "weiblich",
      testnutzen: "Praesidiumsrolle · nur stellvertretende Ausschussmitgliedschaften (Trennungspfad) · CSU in Fraktionsgemeinschaft CDU/CSU · Direktmandat Bayern",
      sonstigeGremien: Object.freeze([
        "Gemeinsamer Ausschuss (Art. 53a GG) — kein staendiger Ausschuss, Modellluecke, nicht in Ausschussfeldern abbildbar"
      ]),
      belege: Object.freeze([
        "bundestag.de/abgeordnete/biografien/L/lindholz_andrea-1045830 (amtliches Profil, 21. WP: committees leer; stellvertretend Innenausschuss + Ausschuss fuer Recht und Verbraucherschutz; Vizepraesidentin; Gemeinsamer Ausschuss)",
        "bundestag.de/parlament/praesidium/bundestagsvizepraesidentin-lindholz-1058174 (Vizepraesidentin, gewaehlt 25.03.2025)",
        "lindholz.de (offizielle persoenliche Seite, deckungsgleich; Direktmandat Aschaffenburg 2025)"
      ]),
      abrufdatum: "2026-08-04 (Korrektur 3. Durchgang, amtlich bestaetigt)"
    })
  }),
  Object.freeze({
    id: "test-mdb-bernd-baumann",
    fullName: "Bernd Baumann",
    party: "AfD",
    faction: "AfD",
    function: "Erster Parlamentarischer Geschäftsführer der AfD-Fraktion",
    role: "Erster Parlamentarischer Geschäftsführer der AfD-Fraktion",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    state: "Hamburg",
    constituency: "", // Landesliste Hamburg — kein Wahlkreismandat behauptet; Region ueber state
    committees: Object.freeze(["Innenausschuss"]),
    focusTopics: Object.freeze(["Innere Sicherheit", "Parlamentsrecht"]), // redaktionelle Testannahme
    topicPriorities: Object.freeze({ "Innere Sicherheit": 5, Parlamentsrecht: 4 }),
    regionalInterests: Object.freeze(["Hamburg"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Landesliste Hamburg (Bundestagswahl 2025)",
      geschlecht: "maennlich",
      testnutzen: "Fraktionsgeschaeftsfuehrung · Listenmandat Stadtstaat ohne Wahlkreis · Innenausschuss (WP-21-Bezeichnung „Innenausschuss\", NICHT der WP-19/20-Name „Ausschuss fuer Inneres und Heimat\")",
      sonstigeGremien: Object.freeze([
        "Aeltestenrat (qua Amt als Erster PGF) — kein staendiger Ausschuss, nicht in Ausschussfeldern abbildbar",
        "Gemeinsamer Ausschuss (Art. 53a GG) — kein staendiger Ausschuss, Modellluecke, nicht in Ausschussfeldern abbildbar"
      ]),
      belege: Object.freeze([
        "bundestag.de/abgeordnete/biografien/B/baumann_bernd-1043568 (amtliches Profil, 21. WP: ordentlich Innenausschuss; Aeltestenrat; Gemeinsamer Ausschuss)",
        "afdbundestag.de/abgeordnete/dr-bernd-baumann (Fraktionsseite, deckungsgleich: Erster Parlamentarischer Geschaeftsfuehrer, Innenausschuss)"
      ]),
      abrufdatum: "2026-08-04 (Korrektur 3. Durchgang, amtlich bestaetigt)"
    })
  }),
  Object.freeze({
    id: "test-mdb-ralf-stegner",
    fullName: "Ralf Stegner",
    party: "SPD",
    faction: "SPD",
    function: "Vorsitzender des Unterausschusses Rüstungs- und Proliferationskontrolle, Nichtverbreitung und internationale Abrüstung",
    role: "Vorsitzender des Unterausschusses Rüstungs- und Proliferationskontrolle, Nichtverbreitung und internationale Abrüstung",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    state: "Schleswig-Holstein",
    constituency: "Pinneberg (betreuter Wahlkreis, Landeslistenmandat)",
    // Ordentlich/stellvertretend strikt getrennt (21. WP, amtliches Profil Stand
    // 03.08.2026): der Unterausschuss-Vorsitz ist eine FUNKTION (function/role), kein
    // Eintrag in einer Ausschussliste — Unterausschuss und OSZE-Versammlung gehoeren
    // nicht zur Sollmenge der 24 staendigen Ausschuesse (sonstige Gremien, siehe herkunft).
    committees: Object.freeze(["Auswärtiger Ausschuss", "Ausschuss für Menschenrechte und humanitäre Hilfe"]),
    deputyCommittees: Object.freeze(["Ausschuss für die Angelegenheiten der Europäischen Union", "Innenausschuss"]),
    focusTopics: Object.freeze(["Außenpolitik", "Abrüstung", "Rüstungskontrolle", "Menschenrechte"]), // redaktionelle Testannahme
    topicPriorities: Object.freeze({ "Außenpolitik": 5, "Abrüstung": 5, "Rüstungskontrolle": 4, Menschenrechte: 4 }),
    regionalInterests: Object.freeze(["Pinneberg", "Schleswig-Holstein"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Landesliste Schleswig-Holstein Platz 3 (Bundestagswahl 2025)",
      geschlecht: "maennlich",
      testnutzen: "Fachpolitiker Auswaertiges (Grundgesetz-Ausschuss Art. 45a) · zwei ordentliche + zwei stellvertretende Mitgliedschaften (Trennungspfad) · Unterausschuss-Vorsitz als Funktion, nicht als Ausschuss",
      sonstigeGremien: Object.freeze([
        "Unterausschuss Ruestungs- und Proliferationskontrolle, Nichtverbreitung und internationale Abruestung (Vorsitz — als Funktion abgebildet)",
        "Parlamentarische Versammlung der OSZE (kein staendiger Ausschuss — Modellluecke, nicht in Ausschussfeldern abbildbar)"
      ]),
      belege: Object.freeze([
        "bundestag.de/abgeordnete/biografien/S/stegner_ralf-1047542 (amtliches Profil, Stand 03.08.2026: ordentlich Auswaertiger Ausschuss + Menschenrechte und humanitaere Hilfe; stellvertretend EU-Ausschuss + Innenausschuss; Vorsitz Unterausschuss; OSZE-Versammlung)",
        "bundestag.de-Textarchiv: Konstituierung des Unterausschusses Ruestungs- und Proliferationskontrolle 17.10.2025 (Vorsitz Stegner)",
        "spdfraktion.de/abgeordnete/stegner (Fraktionsprofil, deckungsgleich)"
      ]),
      abrufdatum: "2026-08-04 (Korrektur 3. Durchgang, amtlicher Profilstand 03.08.2026)"
    })
  }),
  Object.freeze({
    id: "test-mdb-julia-verlinden",
    fullName: "Julia Verlinden",
    party: "Bündnis 90/Die Grünen",
    faction: "Bündnis 90/Die Grünen",
    function: "Stellvertretende Fraktionsvorsitzende",
    role: "Stellvertretende Fraktionsvorsitzende",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    state: "Niedersachsen",
    constituency: "", // Landesliste Niedersachsen — kein Wahlkreismandat behauptet
    // Stellv. Fraktionsvorsitz (Themenkoordination) — KEINE ordentliche Mitgliedschaft in
    // einem der 24 staendigen Ausschuesse (amtliches Profil Stand 29.07.2026); stellvertretend
    // ist sie Mitglied im Ausschuss fuer Wirtschaft und Energie und im Verkehrsausschuss.
    // Der Gemeinsame Ausschuss (Art. 53a GG) ist KEIN staendiger Ausschuss -> Modellluecke.
    committees: Object.freeze([]),
    deputyCommittees: Object.freeze(["Ausschuss für Wirtschaft und Energie", "Verkehrsausschuss"]),
    focusTopics: Object.freeze(["Energie", "Klimaschutz", "Umwelt", "Verkehr", "Landwirtschaft", "Tourismus"]), // redaktionelle Testannahme aus dem belegten Koordinationsbereich
    topicPriorities: Object.freeze({ Energie: 5, Klimaschutz: 5, Umwelt: 4, Verkehr: 3, Landwirtschaft: 3, Tourismus: 2 }),
    regionalInterests: Object.freeze(["Lüneburg", "Niedersachsen"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Landesliste Niedersachsen Platz 3 (Bundestagswahl 2025)",
      geschlecht: "weiblich",
      testnutzen: "Stellv. Fraktionsvorsitz mit Themenkoordination statt ordentlichem Ausschuss · Energie-/Verkehrsfachgebiet stellvertretend · Listenmandat Niedersachsen",
      sonstigeGremien: Object.freeze([
        "Gemeinsamer Ausschuss (Art. 53a GG) — kein staendiger Ausschuss, Modellluecke, nicht in Ausschussfeldern abbildbar"
      ]),
      belege: Object.freeze([
        "bundestag.de/abgeordnete/biografien/V/verlinden_julia-1047856 (amtliches Profil, Stand 29.07.2026: keine ordentliche Mitgliedschaft; stellvertretend Ausschuss fuer Wirtschaft und Energie + Verkehrsausschuss; Gemeinsamer Ausschuss)",
        "julia-verlinden.de (stellvertretende Fraktionsvorsitzende, 21. Wahlperiode)"
      ]),
      korrekturvermerk: "2026-08-04/3: die Erstangabe „stv. Mitglied im Ausschuss fuer Wahlpruefung, Immunitaet und Geschaeftsordnung“ (aus einer Fraktionsseiten-Snippet-Auswertung) ist gegen das amtliche Profil NICHT haltbar und wurde entfernt.",
      abrufdatum: "2026-08-04 (Korrektur 3. Durchgang, amtlicher Profilstand 29.07.2026)"
    })
  }),
  Object.freeze({
    id: "test-mdb-soeren-pellmann",
    fullName: "Sören Pellmann",
    party: "Die Linke",
    faction: "Die Linke",
    // ZWEI amtlich belegte Funktionen. `function`/`rolle` ist EIN Freitextfeld (keine
    // strukturierte Funktionsliste — begrenzte Modellluecke, keine Schemaaenderung):
    // beide Funktionen werden kombiniert im Freitext gefuehrt, damit keine belegte
    // Information stillschweigend verworfen wird.
    function: "Fraktionsvorsitzender (Co-Vorsitz); Obmann im Petitionsausschuss",
    role: "Fraktionsvorsitzender (Co-Vorsitz); Obmann im Petitionsausschuss",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    state: "Sachsen",
    // Wahlkreisnummer bewusst NICHT behauptet: die Nummerierung des Leipziger Sued-
    // Wahlkreises differiert zwischen Wahlperioden (152/153) — Name statt Nummer.
    constituency: "Leipzig II (Leipzig-Süd)",
    committees: Object.freeze(["Petitionsausschuss"]), // ordentliches Mitglied (amtlich, 21. WP)
    deputyCommittees: Object.freeze(["Ausschuss für Arbeit und Soziales"]), // stellvertretend (amtliches Profil Stand 01.08.2026)
    focusTopics: Object.freeze(["Soziales", "Inklusion", "Teilhabe", "Ostdeutschland"]), // redaktionelle Testannahme
    topicPriorities: Object.freeze({ Soziales: 5, Inklusion: 5, Teilhabe: 4, Ostdeutschland: 4 }),
    regionalInterests: Object.freeze(["Leipzig", "Sachsen"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Direktmandat Leipzig II / Leipzig-Süd (Bundestagswahl 2025, 36,8 % Erststimmen, drittes Direktmandat in Folge)",
      geschlecht: "maennlich",
      testnutzen: "Fraktionsvorsitz MIT ordentlicher Ausschussmitgliedschaft (Petitionen, Obmann) und stellvertretender Mitgliedschaft (Arbeit und Soziales) · ostdeutsches Direktmandat · Kollisionsprobe zum aktiven Linke-Bestandsmandat (anderes Bundesland, andere Person)",
      sonstigeGremien: Object.freeze([
        "Gemeinsamer Ausschuss (Art. 53a GG) — kein staendiger Ausschuss, Modellluecke, nicht in Ausschussfeldern abbildbar",
        "Wahlpruefungsausschuss (Gremium nach Wahlpruefungsgesetz) — kein staendiger Ausschuss, Modellluecke"
      ]),
      belege: Object.freeze([
        "bundestag.de/abgeordnete/biografien/P/pellmann_soeren-1046508 (amtliches Profil, Stand 01.08.2026: ordentlich Petitionsausschuss; stellvertretend Ausschuss fuer Arbeit und Soziales; Obmann im Petitionsausschuss; Gemeinsamer Ausschuss)",
        "bundestag.de/dokumente/textarchiv/2025/kw10-fraktionsvorstaende-1056150 (amtlich: Co-Fraktionsvorsitz Reichinnek/Pellmann seit Maerz 2025)",
        "dielinkebt.de/themen/dossiers/petitionen/unsere-mitglieder-des-petitionsausschusses (Fraktionsseite, deckungsgleich)",
        "soeren-pellmann.de (Direktmandat Leipzig, Bundestagswahl 2025)"
      ]),
      abrufdatum: "2026-08-04 (Korrektur 3. Durchgang, amtlicher Profilstand 01.08.2026)"
    })
  })
]);

// Kennungen der sechs BESTEHENDEN aktiven Production-Mandate (nur Kennungen, keine
// Profildaten): dient der Kollisionspruefung — die Testmandate duerfen weder eine
// bestehende id noch (als aktives Paar) einen bestehenden Klarnamen doppeln.
// Quelle: rein lesende Bestandspruefung 2026-08-04 (docs/multitenancy-
// profilbereitschaft-bundestag.md §4); die Kennungen stehen bereits in der Repo-Doku.
const BESTANDSMANDATE_IDS = Object.freeze([
  "annika-klose", "cem-ince", "helmut-kleebank", "max-mustermann",
  "ottilie-paola-klein-2", "ruppert-st-we"
]);

// Selbstschutz der Datei: Vertragseigenschaften, die JEDER Eintrag erfuellen muss.
// Wird von scripts/profil-bereitschaft-test.js ausgefuehrt (kein Laufzeit-Import).
function validateTestmandate() {
  const fehler = [];
  const ids = new Set();
  for (const t of TESTMANDATE) {
    if (!/^test-mdb-[a-z0-9-]+$/.test(t.id)) fehler.push(`Kennung ohne test-mdb-Praefix: ${t.id}`);
    if (ids.has(t.id)) fehler.push(`doppelte Kennung: ${t.id}`);
    ids.add(t.id);
    if (BESTANDSMANDATE_IDS.includes(t.id)) fehler.push(`Kollision mit Bestandsmandat: ${t.id}`);
    if (t.profileActive !== false) fehler.push(`nicht deaktiviert: ${t.id}`);
    if (t.internesTestmandat !== true) fehler.push(`nicht als internes Testmandat markiert: ${t.id}`);
    if (t.parliamentType !== "Bundestag") fehler.push(`keine Bundestagsklassifizierung: ${t.id}`);
    for (const feld of ["email", "password", "passwordHash", "inviteUrl"]) {
      if (feld in t) fehler.push(`Konto-/Auth-Feld im Mandatsprofil: ${t.id}.${feld}`);
    }
    if (!t.herkunft || !Array.isArray(t.herkunft.belege) || !t.herkunft.belege.length || !t.herkunft.abrufdatum) {
      fehler.push(`Herkunft/Belege/Abrufdatum fehlen: ${t.id}`);
    }
  }
  return { ok: fehler.length === 0, fehler };
}

module.exports = {
  PRUEFDATUM,
  WAHLPERIODE,
  TESTMANDATE,
  BESTANDSMANDATE_IDS,
  validateTestmandate
};
