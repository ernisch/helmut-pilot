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

// --- Dateinamen der ausfuehrbaren Schritte (Punkt 14B) ----------------------------------------
// Bis 14A war Schritt 5 der Aktivierungsreihenfolge ("Abnahmeprofil anlegen") nur PROSA und ein
// Verweis auf ein Provisionierungswerkzeug — als einziger der 9 Production-Schritte ohne Datei,
// ohne Vorbedingung, ohne Dry Run und ohne Rollback-Datei. Punkt 14B schliesst genau diese
// Luecke: eine Datei je Schritt, je Datei eine Transaktion, fail-closed wie die Aktivierungs-SQL.
const DATEI_ANLEGEN = "20260726_berlin_abnahmeprofil.sql";
const DATEI_RB0 = "20260726_berlin_abnahmeprofil_rollback_stufe0.sql";
const DATEI_RB1 = "20260726_berlin_abnahmeprofil_rollback_stufe1.sql";
const DATEI_RB2 = "20260726_berlin_abnahmeprofil_rollback_stufe2.sql";

// --- Spaetere Production-Schritte (freigabepflichtig, NICHT ausgefuehrt) -----------------------
// Reihenfolge ist bindend: das Profil kommt VOR dem Paketstatus und VOR dem Flag. So ist der
// letzte Schritt zugleich der schnellste Rueckweg.
const PRODUCTION_SCHRITTE = Object.freeze([
  Object.freeze({
    nr: 1, mutierend: true, was: "Zeile in `profiles` anlegen (id + name)",
    warum: "liefert fullName; ohne sie ist impact.kannRadar false",
    werkzeug: DATEI_ANLEGEN + " (Punkt 14B: ausfuehrbar, fail-closed, idempotent)"
  }),
  Object.freeze({
    nr: 2, mutierend: true, was: "Zeile in `mandate_profiles` anlegen (Felder wie PRODUCTION_ZEILEN)",
    warum: "politische_ebene='landtag' + bundesland='Berlin' erzeugen die Referenz auf berlin-basis",
    werkzeug: "dieselbe Datei, dieselbe Transaktion — beide Zeilen entstehen gemeinsam oder gar nicht"
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

// =============================================================================================
// PUNKT 14B — AUSFUEHRBARE SCHRITTE: Bedingungen als Daten, aus denen sowohl das SQL als auch
// der read-only Dry Run entstehen. Eine Quelle, zwei Ableitungen — es gibt keine zweite Kopie
// der Regel, die auseinanderlaufen koennte.
// =============================================================================================

// Tabellen mit `ON DELETE CASCADE` auf `profiles(id)`. Gemessen am 2026-07-26 gegen das
// Production-Schema (pg_constraint), nicht behauptet. WICHTIG fuer den Rueckweg: ein `delete`
// auf `profiles` erzeugt KEINE Fremdschluessel-Waisen (die aeltere Runbook-Formulierung war
// falsch) — es LOESCHT die abhaengigen Zeilen mit. Das ist das groessere Risiko, nicht das
// kleinere, und deshalb ist Stufe 2 an "0 abhaengige Zeilen" gebunden.
const ABHAENGIGE_TABELLEN = Object.freeze([
  "briefings", "communication_drafts", "daily_tasks", "decisions", "interactions",
  "matching_results", "matching_weights", "office_outputs", "personalized_recommendations",
  "political_items", "priority_changes", "profile_embeddings", "topic_memory", "user_notes"
]);

// --- Bedingungsbauer (feste Formen, damit SQL und JS nicht driften koennen) --------------------
function bedProfilzeile(modus, erlaubt, meldung) {
  return Object.freeze({ art: "profilzeile", modus, erlaubt: Object.freeze(erlaubt.slice()), meldung });
}
function bedMandatszeile(modus, erlaubt, meldung) {
  return Object.freeze({ art: "mandatszeile", modus, erlaubt: Object.freeze(erlaubt.slice()), meldung });
}
function bedFremdeLandtagsprofile(bundesland, erlaubt, meldung) {
  return Object.freeze({ art: "fremde_landtagsprofile", bundesland: bundesland || null, erlaubt: Object.freeze(erlaubt.slice()), meldung });
}
function bedBerechtigtesBerlinerMandat(erlaubt, meldung) {
  return Object.freeze({ art: "berechtigtes_berliner_mandat", erlaubt: Object.freeze(erlaubt.slice()), meldung });
}
function bedAbhaengigeDaten(erlaubt, meldung) {
  return Object.freeze({ art: "abhaengige_daten", tabellen: ABHAENGIGE_TABELLEN, erlaubt: Object.freeze(erlaubt.slice()), meldung });
}

const M = PRODUCTION_ZEILEN.mandate_profiles;

// Traegt eine gelesene mandate_profiles-Zeile GENAU die Sollfelder? Bewusst feldweise und
// vollstaendig: eine Zeile mit richtigem Bundesland, aber fehlendem Schwerpunkt waere
// `nicht_bereit` und wuerde 0 zur Referenzzaehlung beitragen (Befund P-1).
function gleicheListe(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  return x.length === y.length && x.every((v, i) => String(v) === String(y[i]));
}
function traegtSollfelder(zeile = {}) {
  return zeile.politische_ebene === M.politische_ebene
    && String(zeile.bundesland || "") === M.bundesland
    && String(zeile.partei || "") === M.partei
    && String(zeile.wahlkreis || "") === M.wahlkreis
    && gleicheListe(zeile.fachpolitische_schwerpunkte, M.fachpolitische_schwerpunkte)
    && gleicheListe(zeile.regionale_interessen, M.regionale_interessen);
}

// Auswertung gegen eine Datenbanksicht. Rein, ohne IO. Fehlende Tabelle = leer -> fail-closed.
// `db.abhaengige` ist eine Abbildung Tabelle -> Zeilenzahl fuer DIESE Profil-Id.
function pruefeProfilBedingung(bedingung, db = {}) {
  const profiles = db.profiles || [];
  const mandate = db.mandate_profiles || [];
  const meine = profiles.filter((r) => r.id === PROFIL_ID);
  const meinMandat = mandate.filter((r) => r.user_id === PROFIL_ID);
  const lebt = (r) => r.aktiv !== false && !r.geloescht_at;

  if (bedingung.art === "profilzeile") {
    let ist;
    if (bedingung.modus === "mit_sollnamen") ist = meine.filter((r) => r.name === PRODUCTION_ZEILEN.profiles.name).length;
    else if (bedingung.modus === "fremder_name") ist = meine.filter((r) => r.name !== PRODUCTION_ZEILEN.profiles.name).length;
    else ist = meine.length;
    return { ok: bedingung.erlaubt.includes(ist), ist, erlaubt: bedingung.erlaubt };
  }
  if (bedingung.art === "mandatszeile") {
    let ist;
    if (bedingung.modus === "sollfelder") ist = meinMandat.filter(traegtSollfelder).length;
    else if (bedingung.modus === "abweichend") ist = meinMandat.filter((r) => !traegtSollfelder(r)).length;
    else if (bedingung.modus === "aktiv") ist = meinMandat.filter(lebt).length;
    else if (bedingung.modus === "inaktiv") ist = meinMandat.filter((r) => r.aktiv === false).length;
    else if (bedingung.modus === "geloescht") ist = meinMandat.filter((r) => Boolean(r.geloescht_at)).length;
    else ist = meinMandat.length;
    return { ok: bedingung.erlaubt.includes(ist), ist, erlaubt: bedingung.erlaubt };
  }
  if (bedingung.art === "fremde_landtagsprofile") {
    const ist = mandate.filter((r) => r.user_id !== PROFIL_ID && r.politische_ebene === "landtag" && lebt(r)
      && (!bedingung.bundesland || String(r.bundesland || "").toLowerCase() === bedingung.bundesland)).length;
    return { ok: bedingung.erlaubt.includes(ist), ist, erlaubt: bedingung.erlaubt };
  }
  if (bedingung.art === "berechtigtes_berliner_mandat") {
    // Nahe an der V3-Pruefabfrage: Ebene, Bundesland, Lebendigkeit UND die Identitaetsfelder.
    // Ohne die letzte Bedingung meldete die Pruefung 1, waehrend die Aktivierungslogik 0 zaehlt.
    const namen = new Map(profiles.map((r) => [r.id, String(r.name || "").trim()]));
    const ist = mandate.filter((r) => r.politische_ebene === "landtag" && lebt(r)
      && String(r.bundesland || "").toLowerCase() === BUNDESLAND.toLowerCase()
      && (String(r.partei || "").trim() || namen.get(r.user_id))
      && (String(r.wahlkreis || "").trim() || String(r.bundesland || "").trim())
      && ((Array.isArray(r.fachpolitische_schwerpunkte) && r.fachpolitische_schwerpunkte.length)
        || (Array.isArray(r.ausschuesse) && r.ausschuesse.length))).length;
    return { ok: bedingung.erlaubt.includes(ist), ist, erlaubt: bedingung.erlaubt };
  }
  if (bedingung.art === "abhaengige_daten") {
    const zaehler = db.abhaengige || {};
    const ist = bedingung.tabellen.reduce((s, t) => s + (Number(zaehler[t]) || 0), 0);
    return { ok: bedingung.erlaubt.includes(ist), ist, erlaubt: bedingung.erlaubt };
  }
  throw new Error("Unbekannte Bedingungsart: " + bedingung.art);
}

// --- Die vier ausfuehrbaren Schritte ----------------------------------------------------------
// Schritt 5 der Aktivierungsreihenfolge (§9 des Runbooks) plus DREI getrennte Rueckwege.
// Getrennte Dateien, getrennte Transaktionen — dieselbe Bauform wie die Aktivierungs-SQL aus
// 14A, damit niemand zwei Rueckbaustufen versehentlich am Stueck faehrt.
function profilschritte() {
  return Object.freeze([
    Object.freeze({
      id: "P", nummer: 1, art: "anlegen", datei: DATEI_ANLEGEN,
      titel: "Abnahmeprofil anlegen (zwei Zeilen, eine Transaktion)",
      zweck: "Legt das Berliner Landtags-Testmandat an. Erst dadurch zaehlt die Referenz auf "
        + BUNDESLAND + "; ohne dieses Profil aktiviert HELMUT_LANDESMODULE=berlin nachweislich "
        + "0 Wege (Befund aus dem 2. Production-Anlauf). Schaltet KEINEN Abrufweg scharf und "
        + "setzt KEIN Flag.",
      tabellen: Object.freeze(["profiles", "mandate_profiles"]),
      vorbedingungen: Object.freeze([
        bedProfilzeile("fremder_name", [0],
          "Unter dieser Id existiert bereits ein FREMDER Datensatz — Abbruch statt Ueberschreiben"),
        bedMandatszeile("abweichend", [0],
          "Unter dieser Id existiert bereits eine abweichende Mandatszeile — Abbruch statt Ueberschreiben"),
        bedFremdeLandtagsprofile(null, [0],
          "Es gibt bereits ein anderes aktives Landtagsprofil — der Rueckweg 'Profil deaktivieren' waere dann "
          + "nicht mehr allein hinreichend, um Berlin zu stoppen"),
        bedFremdeLandtagsprofile("brandenburg", [0],
          "Es existiert ein Brandenburger Landtagsmandat — Brandenburg wuerde dadurch bemandatiert")
      ]),
      nachbedingungen: Object.freeze([
        bedProfilzeile("mit_sollnamen", [1], "profiles-Zeile fehlt oder traegt nicht den Sollnamen"),
        bedMandatszeile("sollfelder", [1], "mandate_profiles-Zeile fehlt oder traegt nicht alle Sollfelder"),
        bedMandatszeile("aktiv", [1], "Die Mandatszeile ist nicht aktiv (aktiv=false oder geloescht)"),
        bedBerechtigtesBerlinerMandat([1],
          "Genau EIN aktivierungsberechtigtes Berliner Landtagsmandat erwartet (Befund P-1: Zeilen zaehlen genuegt nicht)"),
        bedFremdeLandtagsprofile("brandenburg", [0], "Brandenburg ist nach dem Schritt bemandatiert")
      ]),
      weiterMit: "20260726_berlin_aktivierung_b1_paketstatus.sql", rollbackDatei: DATEI_RB0
    }),
    Object.freeze({
      id: "P-RB0", nummer: 2, art: "rollback", datei: DATEI_RB0,
      titel: "Rueckweg Stufe 0 · Profil deaktivieren (schnellster Rueckweg)",
      zweck: "Nimmt das Profil sofort aus der Referenzzaehlung. Danach hat Berlin kein "
        + "berechtigtes Landtagsmandat mehr — alle Berliner Wege fallen aus dem Crawl-Plan, "
        + "unabhaengig vom Flag und unabhaengig vom Wegzustand. Kein Datenverlust, Auditspur bleibt.",
      tabellen: Object.freeze(["mandate_profiles"]),
      vorbedingungen: Object.freeze([
        bedMandatszeile("beliebig", [1], "Es gibt keine Mandatszeile unter dieser Id — nichts zu deaktivieren")
      ]),
      nachbedingungen: Object.freeze([
        bedMandatszeile("inaktiv", [1], "Die Mandatszeile ist nicht deaktiviert"),
        bedBerechtigtesBerlinerMandat([0], "Es gibt weiterhin ein aktivierungsberechtigtes Berliner Landtagsmandat")
      ]),
      weiterMit: null, rollbackDatei: null
    }),
    Object.freeze({
      id: "P-RB1", nummer: 3, art: "rollback", datei: DATEI_RB1,
      titel: "Rueckweg Stufe 1 · zusaetzlich als geloescht markieren",
      zweck: "Setzt zusaetzlich `geloescht_at`. Damit ist das Profil auch dann nicht mehr "
        + "berechtigt, wenn jemand `aktiv` wieder auf true setzt (isActivationEligible prueft "
        + "geloescht_at unabhaengig von validateProfile). Weiterhin ohne Datenverlust.",
      tabellen: Object.freeze(["mandate_profiles"]),
      vorbedingungen: Object.freeze([
        bedMandatszeile("beliebig", [1], "Es gibt keine Mandatszeile unter dieser Id")
      ]),
      nachbedingungen: Object.freeze([
        bedMandatszeile("geloescht", [1], "geloescht_at ist nicht gesetzt"),
        bedMandatszeile("inaktiv", [1], "Die Mandatszeile ist nicht deaktiviert"),
        bedBerechtigtesBerlinerMandat([0], "Es gibt weiterhin ein aktivierungsberechtigtes Berliner Landtagsmandat")
      ]),
      weiterMit: null, rollbackDatei: null
    }),
    Object.freeze({
      id: "P-RB2", nummer: 4, art: "rollback", datei: DATEI_RB2,
      titel: "Rueckweg Stufe 2 · Zeilen entfernen (NUR nach Stufe 0/1, NUR ohne erzeugte Daten)",
      zweck: "Entfernt beide Zeilen vollstaendig. `profiles` traegt ON DELETE CASCADE auf "
        + ABHAENGIGE_TABELLEN.length + " weitere Tabellen — ein Loeschen erzeugt also keine Waisen, "
        + "sondern LOESCHT erzeugte Daten mit. Deshalb bricht die Datei ab, sobald auch nur eine "
        + "abhaengige Zeile existiert. Fuer den Regelfall genuegt Stufe 0.",
      tabellen: Object.freeze(["mandate_profiles", "profiles"]),
      vorbedingungen: Object.freeze([
        bedMandatszeile("inaktiv", [1], "Stufe 0 wurde nicht ausgefuehrt — erst deaktivieren, dann loeschen"),
        bedMandatszeile("geloescht", [1], "Stufe 1 wurde nicht ausgefuehrt — erst als geloescht markieren, dann loeschen"),
        bedAbhaengigeDaten([0],
          "Es haengen erzeugte Daten an diesem Profil; ein delete wuerde sie per ON DELETE CASCADE mitloeschen")
      ]),
      nachbedingungen: Object.freeze([
        bedMandatszeile("beliebig", [0], "Die Mandatszeile existiert weiterhin"),
        bedProfilzeile("beliebig", [0], "Die profiles-Zeile existiert weiterhin"),
        bedBerechtigtesBerlinerMandat([0], "Es gibt weiterhin ein aktivierungsberechtigtes Berliner Landtagsmandat")
      ]),
      weiterMit: null, rollbackDatei: null
    })
  ]);
}

module.exports = {
  PROFIL_ID, BUNDESLAND, PFLICHTFELDER, PRODUCTION_ZEILEN, GEMAPPTES_PROFIL,
  GEGENPROBE_PROFILE, ERWARTETE_PAKETE, PRODUCTION_SCHRITTE, RUECKWEG, V3_PRUEFABFRAGE,
  DATEI_ANLEGEN, DATEI_RB0, DATEI_RB1, DATEI_RB2, ABHAENGIGE_TABELLEN,
  traegtSollfelder, pruefeProfilBedingung, profilschritte
};
