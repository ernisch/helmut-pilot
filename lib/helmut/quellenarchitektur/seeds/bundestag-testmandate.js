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
    // Praesidiumsmitglied — KEINE Ausschussmitgliedschaft behauptet. Damit prueft dieses
    // Profil bewusst den Pfad "Themen statt Ausschuss" (Warnung, kein Blocker).
    committees: Object.freeze([]),
    focusTopics: Object.freeze(["Innere Sicherheit", "Recht", "Parlament"]), // redaktionelle Testannahme
    topicPriorities: Object.freeze({ "Innere Sicherheit": 5, Recht: 4, Parlament: 4 }),
    regionalInterests: Object.freeze(["Aschaffenburg", "Unterfranken", "Bayern"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Direktmandat Wahlkreis Aschaffenburg (Bundestagswahl 2025, 43,8 % Erststimmen)",
      geschlecht: "weiblich",
      testnutzen: "Praesidiumsrolle · Profil ohne Ausschuss (Themenpfad) · CSU in Fraktionsgemeinschaft CDU/CSU · Direktmandat Bayern",
      belege: Object.freeze([
        "bundestag.de/parlament/praesidium/bundestagsvizepraesidentin-lindholz-1058174 (Vizepraesidentin, gewaehlt 25.03.2025)",
        "cducsu.de/abgeordnete/andrea-lindholz",
        "lindholz.de (Direktmandat Aschaffenburg, Bundestagswahl 2025)"
      ]),
      abrufdatum: PRUEFDATUM
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
      testnutzen: "Fraktionsgeschaeftsfuehrung · Listenmandat Stadtstaat ohne Wahlkreis · Innenausschuss (WP-21-Bezeichnung „Innenausschuss\")",
      belege: Object.freeze([
        "afdbundestag.de/abgeordnete/dr-bernd-baumann (Erster Parlamentarischer Geschaeftsfuehrer, Innenausschuss)",
        "abgeordnetenwatch.de/profile/bernd-baumann (Orientierung, kein Alleinbeleg)"
      ]),
      abrufdatum: PRUEFDATUM
    })
  }),
  Object.freeze({
    id: "test-mdb-ralf-stegner",
    fullName: "Ralf Stegner",
    party: "SPD",
    faction: "SPD",
    function: "Mitglied des Auswärtigen Ausschusses",
    role: "Mitglied des Auswärtigen Ausschusses",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    state: "Schleswig-Holstein",
    constituency: "Pinneberg (betreuter Wahlkreis, Landeslistenmandat)",
    committees: Object.freeze(["Auswärtiger Ausschuss"]),
    focusTopics: Object.freeze(["Außenpolitik", "Abrüstung", "Rüstungskontrolle"]), // redaktionelle Testannahme
    topicPriorities: Object.freeze({ "Außenpolitik": 5, "Abrüstung": 5, "Rüstungskontrolle": 4 }),
    regionalInterests: Object.freeze(["Pinneberg", "Schleswig-Holstein"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Landesliste Schleswig-Holstein Platz 3 (Bundestagswahl 2025)",
      geschlecht: "maennlich",
      testnutzen: "Fachpolitiker Auswaertiges (Grundgesetz-Ausschuss Art. 45a) · Listenmandat mit betreutem Wahlkreis · Unterausschuss-Konstellation (Abruestung)",
      belege: Object.freeze([
        "spdfraktion.de/abgeordnete/stegner",
        "abgeordnetenwatch.de/profile/ralf-stegner/ausschuss-mitgliedschaften (Auswaertiger Ausschuss + Unterausschuss Abruestung; Orientierung)",
        "ralf-stegner.de"
      ]),
      abrufdatum: PRUEFDATUM
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
    // Stellv. Fraktionsvorsitz (Koordination Umwelt/Energie/Verkehr/Bau/Landwirtschaft/
    // Tourismus) — KEINE WP-21-Ausschussmitgliedschaft zweifelsfrei belegbar -> nicht behauptet.
    committees: Object.freeze([]),
    focusTopics: Object.freeze(["Energie", "Klimaschutz", "Umwelt", "Verkehr", "Landwirtschaft", "Tourismus"]), // redaktionelle Testannahme aus dem belegten Koordinationsbereich
    topicPriorities: Object.freeze({ Energie: 5, Klimaschutz: 5, Umwelt: 4, Verkehr: 3, Landwirtschaft: 3, Tourismus: 2 }),
    regionalInterests: Object.freeze(["Lüneburg", "Niedersachsen"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Landesliste Niedersachsen Platz 3 (Bundestagswahl 2025)",
      geschlecht: "weiblich",
      testnutzen: "Stellv. Fraktionsvorsitz mit Themenkoordination statt Ausschuss · Energie-/Umweltfachgebiet · Listenmandat Niedersachsen",
      belege: Object.freeze([
        "gruene-bundestag.de/abgeordnete/details/dr-julia-verlinden",
        "julia-verlinden.de (stellvertretende Fraktionsvorsitzende, 21. Wahlperiode)",
        "bundestag.de/abgeordnete/biografien/V/verlinden_julia-858122"
      ]),
      abrufdatum: PRUEFDATUM
    })
  }),
  Object.freeze({
    id: "test-mdb-soeren-pellmann",
    fullName: "Sören Pellmann",
    party: "Die Linke",
    faction: "Die Linke",
    function: "Fraktionsvorsitzender (Co-Vorsitz)",
    role: "Fraktionsvorsitzender (Co-Vorsitz)",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    state: "Sachsen",
    // Wahlkreisnummer bewusst NICHT behauptet: die Nummerierung des Leipziger Sued-
    // Wahlkreises differiert zwischen Wahlperioden (152/153) — Name statt Nummer.
    constituency: "Leipzig II (Leipzig-Süd)",
    committees: Object.freeze([]), // Fraktionsvorsitz — keine Ausschussmitgliedschaft behauptet
    focusTopics: Object.freeze(["Soziales", "Inklusion", "Teilhabe", "Ostdeutschland"]), // redaktionelle Testannahme
    topicPriorities: Object.freeze({ Soziales: 5, Inklusion: 5, Teilhabe: 4, Ostdeutschland: 4 }),
    regionalInterests: Object.freeze(["Leipzig", "Sachsen"]),
    profileActive: false,
    internesTestmandat: true,
    herkunft: Object.freeze({
      mandatsart: "Direktmandat Leipzig II / Leipzig-Süd (Bundestagswahl 2025, 36,8 % Erststimmen, drittes Direktmandat in Folge)",
      geschlecht: "maennlich",
      testnutzen: "Fraktionsvorsitz · ostdeutsches Direktmandat · Profil ohne Ausschuss (Themenpfad) · Kollisionsprobe zum aktiven Linke-Bestandsmandat (anderes Bundesland, andere Person)",
      belege: Object.freeze([
        "soeren-pellmann.de (Direktmandat Leipzig, Bundestagswahl 2025)",
        "die-linke-in-leipzig.de/wahlen/bundestagswahl-2025 (Wahlergebnis)",
        "l-iz.de/politik/leipzig/2024/12/… (Wahlkreis Leipzig II; Orientierung, kein Alleinbeleg)"
      ]),
      abrufdatum: PRUEFDATUM
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
