"use strict";

// Helmut — Quellenarchitektur · Phase-1-Punkt 14: PROFILPLAN Berlin (Bedingung V3).
// =============================================================================================
// REINE DATEN + REINE HELFER. Kein DB-Zugriff, kein Netz, keine Aktivierung. Diese Datei LEGT
// KEIN PROFIL AN — sie beschreibt zeilengenau, welches Profil eine spaetere, freigabepflichtige
// Aktivierung braeuchte, und macht diese Beschreibung testbar.
//
// Warum das noetig ist: die Berliner Landespakete werden nicht "eingeschaltet", sondern ueber
// REFERENZZAEHLUNG aktiv (profile-packages.computeGlobalActivation). Ohne ein
// aktivierungsberechtigtes Berliner Landtagsprofil bleibt berlin-basis auch dann wirkungslos,
// wenn Flag, Paketstatus und Wegstatus alle richtig stehen. Das Profil ist der vierte Riegel.
//
// ZWEI BEFUNDE, die diese Datei ausloest (beide in berlin-profilplan-Tests festgenagelt):
//
//   P-1  Die V3-Pruefung des Runbooks ist NOTWENDIG, aber NICHT HINREICHEND.
//        `select count(*) from mandate_profiles where politische_ebene='landtag'
//         and lower(bundesland)='berlin' and aktiv` zaehlt ZEILEN. Aktivierungsberechtigt ist
//        ein Profil aber erst nach `isActivationEligible` -> `validateProfile`, und die liest
//        die GEMAPPTE Form. Eine rohe mandate_profiles-Zeile ohne die Identitaetsfelder ergibt
//        `nicht_bereit` und traegt 0 zur Referenzzaehlung bei: das Paket bliebe still inaktiv,
//        obwohl die Zaehlabfrage 1 meldet. Die Pruefung muss deshalb gegen das gemappte Profil
//        laufen, nicht gegen die Rohzeile.
//
//   P-2  Ein Berliner Profil braucht ZWEI Zeilen, nicht eine.
//        `fromMandateProfileRow` liest `fullName` aus der Zeile der Tabelle `profiles`
//        (Spalte `name`), alles Uebrige aus `mandate_profiles`. Fehlt die profiles-Zeile,
//        bleibt das Profil zwar knapp aktivierungsberechtigt (Partei genuegt als Identitaet),
//        aber `impact.kannRadar` ist false — der Radar braucht einen Namen fuer Personentreffer.
//        Ein Beweislauf mit stillem Radar-Ausfall waere kein Beweis.
//
// KEINE REALE PERSON. Das Abnahmeprofil ist ausdruecklich als Testmandat benannt und traegt
// `partei: "Fraktionslos"` — damit bindet es sich an KEIN Parteipaket und behauptet kein reales
// Mandat. Das Linke-Profil weiter unten dient ausschliesslich der Gegenprobe im Test und wird
// NICHT in Production angelegt.

const PROFIL_ID = "helmut-abnahme-berlin";
const BUNDESLAND = "Berlin";

// --- Pflichtfelder, aus profile-validation.js abgeleitet (nicht behauptet) ---------------------
// Jede Zeile nennt das Feld der GEMAPPTEN Form, die Spalte, aus der es stammt, und die Wirkung,
// wenn es fehlt. `region_oder_wahlkreis` ist fuer ein Landeslistenmandat ueber `bundesland`
// erfuellbar — deshalb steht dort beides.
const PFLICHTFELDER = Object.freeze([
  Object.freeze({ feld: "id", spalte: "profiles.id / mandate_profiles.user_id", fehltWirkung: "Profil ist nicht referenzierbar; Pflichtfeld `nutzerId` fehlt" }),
  Object.freeze({ feld: "fullName", spalte: "profiles.name", fehltWirkung: "Pflichtfeld `name` fehlt; impact.kannRadar = false (keine Personentreffer)" }),
  Object.freeze({ feld: "party", spalte: "mandate_profiles.partei", fehltWirkung: "Pflichtfeld `partei_oder_fraktionslos` fehlt; ohne Name UND Partei ist das Profil `nicht_bereit`" }),
  Object.freeze({ feld: "parliamentType", spalte: "mandate_profiles.politische_ebene = 'landtag'", fehltWirkung: "Pflichtfeld `mandatsebene` fehlt; ohne 'landtag' wird KEIN Landespaket zugeordnet" }),
  Object.freeze({ feld: "state", spalte: "mandate_profiles.bundesland = 'Berlin'", fehltWirkung: "Pflichtfeld `bundesland` fehlt; Landespaket bleibt `requiredMissing`" }),
  Object.freeze({ feld: "constituency | state", spalte: "mandate_profiles.wahlkreis bzw. bundesland", fehltWirkung: "Pflichtfeld `region_oder_wahlkreis` fehlt" }),
  Object.freeze({ feld: "committees | focusTopics", spalte: "mandate_profiles.ausschuesse bzw. fachpolitische_schwerpunkte", fehltWirkung: "Pflichtfeld `schwerpunkt_oder_ausschuss` fehlt" }),
  Object.freeze({ feld: "profileActive", spalte: "mandate_profiles.aktiv = true", fehltWirkung: "aktiv=false -> `deaktiviert` -> traegt 0 zur Referenzzaehlung bei" })
]);

// --- Die zwei Production-Zeilen (NICHT angelegt) ----------------------------------------------
// Genau so, wie sie spaeter ueber das Provisionierungswerkzeug entstehen wuerden.
const PRODUCTION_ZEILEN = Object.freeze({
  profiles: Object.freeze({
    id: PROFIL_ID,
    name: "Testmandat Berlin (Helmut-Abnahme)"
  }),
  mandate_profiles: Object.freeze({
    user_id: PROFIL_ID,
    politische_ebene: "landtag",
    bundesland: BUNDESLAND,
    // "Fraktionslos" ist in profile-validation ausdruecklich vorgesehen und bindet das Profil an
    // KEIN Parteipaket. Ein Testmandat darf keiner realen Partei zugeschrieben werden.
    partei: "Fraktionslos",
    wahlkreis: "Berlin (Landesebene, Abnahmeprofil)",
    fachpolitische_schwerpunkte: Object.freeze(["Landespolitik Berlin"]),
    regionale_interessen: Object.freeze([BUNDESLAND]),
    aktiv: true,
    onboarding_status: "neu"
  })
});

// --- Die gemappte Form (so sieht das Profil in der Aktivierungslogik aus) ----------------------
// Nachgebildet nach storage.fromMandateProfileRow. Der Test prueft, dass diese Form
// aktivierungsberechtigt ist UND genau die erwarteten Pakete zieht.
const GEMAPPTES_PROFIL = Object.freeze({
  id: PROFIL_ID,
  fullName: PRODUCTION_ZEILEN.profiles.name,
  party: PRODUCTION_ZEILEN.mandate_profiles.partei,
  politicalLevel: "Land",
  parliamentType: "Landtag",
  politische_ebene: "landtag",
  state: BUNDESLAND,
  bundesland: BUNDESLAND,
  constituency: PRODUCTION_ZEILEN.mandate_profiles.wahlkreis,
  focusTopics: [...PRODUCTION_ZEILEN.mandate_profiles.fachpolitische_schwerpunkte],
  regionalInterests: [...PRODUCTION_ZEILEN.mandate_profiles.regionale_interessen],
  profileActive: true
});

// Nur fuer die Gegenprobe im Test — wird NICHT in Production angelegt.
const GEGENPROBE_PROFILE = Object.freeze({
  berlinLinke: Object.freeze({
    ...GEMAPPTES_PROFIL, id: "t-be-linke", fullName: "Testmandat Berlin Linke", party: "Die Linke"
  }),
  brandenburg: Object.freeze({
    ...GEMAPPTES_PROFIL, id: "t-bb", fullName: "Testmandat Brandenburg",
    state: "Brandenburg", bundesland: "Brandenburg"
  }),
  bundestag: Object.freeze({
    ...GEMAPPTES_PROFIL, id: "t-bt", fullName: "Testmandat Bund",
    parliamentType: "Bundestag", politische_ebene: "bundestag", politicalLevel: "Bund"
  }),
  // Fehlerhafte Profile, die NICHT aktivieren duerfen.
  ohneEbene: Object.freeze({ ...GEMAPPTES_PROFIL, id: "t-ohne-ebene", parliamentType: undefined, politische_ebene: undefined, politicalLevel: undefined }),
  ohneBundesland: Object.freeze({ ...GEMAPPTES_PROFIL, id: "t-ohne-bl", state: undefined, bundesland: undefined }),
  deaktiviert: Object.freeze({ ...GEMAPPTES_PROFIL, id: "t-deaktiviert", profileActive: false }),
  geloescht: Object.freeze({ ...GEMAPPTES_PROFIL, id: "t-geloescht", geloescht_at: "2026-07-26T00:00:00Z" }),
  leer: Object.freeze({ id: "t-leer" }),
  falschesBundesland: Object.freeze({ ...GEMAPPTES_PROFIL, id: "t-bayern", state: "Bayern", bundesland: "Bayern" })
});

// --- Erwartete Paketzuordnung -----------------------------------------------------------------
// Die Erwartung steht hier als DATEN, damit der Test sie gegen den echten Resolver prueft und
// nicht gegen eine zweite Kopie der Resolver-Logik.
const ERWARTETE_PAKETE = Object.freeze({
  required: Object.freeze(["bund-basis", "berlin-basis"]),
  // "profil-<id>" wird vom Resolver immer referenziert; wirksam nur, wenn ein Paket mit diesem
  // Key existiert. Fuer das Abnahmeprofil existiert keines -> die Referenz bleibt folgenlos.
  optionalErlaubt: Object.freeze(["profil-" + PROFIL_ID]),
  verboten: Object.freeze(["brandenburg-basis", "die-linke-brandenburg", "die-linke-berlin", "die-linke-bund", "regional-niedersachsen"])
});

// --- Spaetere Production-Schritte (freigabepflichtig, NICHT ausgefuehrt) -----------------------
// Reihenfolge ist bindend: das Profil kommt VOR dem Paketstatus und VOR dem Flag. So ist der
// letzte Schritt zugleich der schnellste Rueckweg.
const PRODUCTION_SCHRITTE = Object.freeze([
  Object.freeze({
    nr: 1, mutierend: true, was: "Zeile in `profiles` anlegen (id + name)",
    warum: "liefert fullName; ohne sie ist impact.kannRadar false",
    werkzeug: "Provisionierungswerkzeug (docs/betrieb/zweitmandant-provisionierung-runbook.md)"
  }),
  Object.freeze({
    nr: 2, mutierend: true, was: "Zeile in `mandate_profiles` anlegen (Felder wie PRODUCTION_ZEILEN)",
    warum: "politische_ebene='landtag' + bundesland='Berlin' erzeugen die Referenz auf berlin-basis",
    werkzeug: "dasselbe Werkzeug"
  }),
  Object.freeze({
    nr: 3, mutierend: false, was: "Gegenprobe gegen das GEMAPPTE Profil, nicht gegen die Rohzeile",
    warum: "Befund P-1: die Zaehlabfrage allein belegt keine Aktivierungsberechtigung",
    werkzeug: "Admin-Profilansicht (Zustand muss `vollstaendig` sein, nicht `nicht_bereit`)"
  }),
  Object.freeze({
    nr: 4, mutierend: false, was: "pruefen: required = bund-basis + berlin-basis, kein Brandenburg-Paket",
    warum: "verhindert, dass ein Tippfehler im Bundesland ein fremdes Landesmodul zieht",
    werkzeug: "Admin-Paketansicht"
  })
]);

// --- Rueckweg ---------------------------------------------------------------------------------
// Deaktivieren schlaegt Loeschen: `aktiv=false` nimmt das Profil sofort aus der Referenzzaehlung
// (isActivationEligible -> validateProfile -> DISABLED), laesst aber die Auditspur stehen.
const RUECKWEG = Object.freeze([
  Object.freeze({
    stufe: 0, mittel: "update mandate_profiles set aktiv = false where user_id = '" + PROFIL_ID + "'",
    wirkung: "Profil traegt 0 zur Referenzzaehlung bei -> berlin-basis faellt auf 'inactive' zurueck, "
      + "sobald kein anderes Berliner Profil existiert. Kein Datenverlust.",
    sofort: true
  }),
  Object.freeze({
    stufe: 1, mittel: "zusaetzlich `geloescht_at` setzen",
    wirkung: "Profil gilt zusaetzlich als geloescht (isActivationEligible = false, unabhaengig von validateProfile).",
    sofort: true
  }),
  Object.freeze({
    stufe: 2, mittel: "delete from mandate_profiles ...; delete from profiles ...",
    wirkung: "vollstaendige Entfernung. NUR nach Stufe 0/1 und nur, wenn keine erzeugten Daten "
      + "(Briefings, Interaktionen) daran haengen — sonst bleiben Fremdschluessel-Waisen.",
    sofort: false
  })
]);

// Zaehlabfrage, wie sie in V3 stehen sollte: Zeilen zaehlen UND die Identitaetsfelder mitpruefen.
// Ersetzt nicht die Pruefung am gemappten Profil, verhindert aber den haeufigsten Fehler.
const V3_PRUEFABFRAGE = [
  "select mp.user_id, p.name is not null and length(trim(p.name)) > 0 as hat_namen,",
  "       mp.partei, mp.wahlkreis, mp.fachpolitische_schwerpunkte, mp.ausschuesse, mp.aktiv",
  "  from mandate_profiles mp",
  "  left join profiles p on p.id = mp.user_id",
  " where mp.politische_ebene = 'landtag' and lower(mp.bundesland) = 'berlin' and mp.aktiv",
  "   and mp.geloescht_at is null;",
  "-- erwartet: genau 1 Zeile, hat_namen = true, partei gesetzt,",
  "-- wahlkreis gesetzt, und mindestens eines von fachpolitische_schwerpunkte/ausschuesse nicht leer."
].join("\n");

module.exports = {
  PROFIL_ID, BUNDESLAND, PFLICHTFELDER, PRODUCTION_ZEILEN, GEMAPPTES_PROFIL,
  GEGENPROBE_PROFILE, ERWARTETE_PAKETE, PRODUCTION_SCHRITTE, RUECKWEG, V3_PRUEFABFRAGE
};
