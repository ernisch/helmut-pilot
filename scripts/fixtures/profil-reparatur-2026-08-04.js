"use strict";

// Sprint "Profilreife" (2026-08-04): PRUEFBARES REPARATURPAKET fuer die sechs bestehenden
// aktiven Bundestags-Mandatsprofile — WIRD NICHT AUTOMATISCH ANGEWENDET.
// =============================================================================================
// Dieses Paket ist reine Dokumentation + Testdaten. Es schreibt NICHTS: kein Skript wendet
// es auf Production an; die Anwendung waere eine eigene, ausdrueckliche Betreiberentscheidung
// (Weg: Admin-Profilverwaltung /api/admin/profile/<id> — das vorhandene Schreibwerkzeug;
// KEIN neues Production-Schreibwerkzeug, Auftrag Phase 6 Nr. 7).
//
// Datenumfang bewusst minimal (CLAUDE.md-Sicherheitsregeln, Auftrag Sicherheitsgrenze 19):
//   * `ist` enthaelt NUR die politisch-oeffentlichen Mandatsfelder, die fuer Pruefung und
//     Reparatur noetig sind (Partei/Fraktion/Ebene/Region/Ausschuesse/Themenanzahl) —
//     KEINE nutzerverfassten Inhalte (mainQuestion, localMedia, …), KEINE Auth-Daten,
//     KEINE E-Mails, kein Roh-Export.
//   * Die Mandats-Kennungen stehen bereits offen in der kanonischen Repo-Doku
//     (docs/datenmotor-restliste.md B5 u. a.).
//
// Stand der IST-Werte: rein lesende Bestandspruefung 2026-08-04 ueber die WIRKSAME
// Profilsicht (Blob-Lesepfad, HELMUT_PROFILE_DB_MODE in Production nicht gesetzt) und die
// relationalen Zeilen (profiles/mandate_profiles). Belege je Vorschlag: offizielle Quellen,
// Abrufdatum 2026-08-04. ABRUFGRENZE wie in seeds/bundestag-ausschuesse.js dokumentiert:
// Direktabrufe extern gesperrt (HTTP 403), Verifikation ueber Suchtreffer der genannten
// offiziellen Quellen; nicht zweifelsfrei Belegbares ist als "zu bestaetigen" markiert.

const ABRUFDATUM = "2026-08-04";

// --- IST-Repraesentation der sechs aktiven Mandate (minimale politische Felder) -------------
const BESTAND_IST = Object.freeze([
  Object.freeze({
    id: "annika-klose", fullName: "Annika Klose", party: "SPD",
    faction: "SPD (Bundestag 2025 - 2029)", parliamentType: "Bundestag", politicalLevel: "Bund",
    state: "Berlin", constituency: "74 - Berlin-Mitte (Bundestag 2025 - 2029)",
    committees: ["Gesundheit", "Europäische Union", "Kultur und Medien"],
    focusTopics: ["Arbeitsmarkt", "Pflege", "Wohnen", "Innere Sicherheit"],
    reportingTopics: ["Sprecher/in der Fraktion", "Obmann/Obfrau im Ausschuss"],
    profileActive: true
  }),
  Object.freeze({
    id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", faction: "Die Linke",
    parliamentType: "Bundestag", politicalLevel: "Bund", state: "Niedersachsen",
    constituency: "Salzgitter-Wolfenbüttel", committees: ["Arbeit und Soziales"],
    focusTopics: ["Arbeit", "Soziales", "Bürgergeld", "Mindestlohn", "Pflege", "Rente"],
    topicPriorities: { Arbeit: 5, Soziales: 5 },
    profileActive: true
  }),
  Object.freeze({
    id: "helmut-kleebank", fullName: "Helmut Kleebank", party: "SPD",
    faction: "SPD (Bundestag 2025 - 2029)", parliamentType: "Bundestag", politicalLevel: "Bund",
    state: "Berlin", constituency: "77 - Berlin-Spandau – Charlottenburg Nord (Bundestag 2025 - 2029)",
    committees: ["Finanzen", "Haushalt"], focusTopics: ["Mindestlohn", "Pflege", "Gesundheit"],
    profileActive: true
  }),
  Object.freeze({
    id: "max-mustermann", fullName: "Ottilie Paola Klein", party: "CDU/CSU", faction: "CDU/CSU",
    parliamentType: "Bundestag", politicalLevel: "Bund", state: "Berlin", constituency: "",
    committees: ["Kultur und Medien"], focusTopics: ["Europa", "Digitalisierung"],
    profileActive: true
  }),
  Object.freeze({
    id: "ottilie-paola-klein-2", fullName: "Ottilie Paola Klein", party: "CDU/CSU",
    faction: "CDU/CSU", parliamentType: "Bundestag", politicalLevel: "Bund", state: "Berlin",
    constituency: "Berlin",
    committees: ["Gesundheit", "Digitales", "Bildung, Forschung und Technikfolgenabschätzung"],
    focusTopics: ["Arbeitsmarkt", "Digitalisierung"],
    profileActive: true
  }),
  Object.freeze({
    id: "ruppert-st-we", fullName: "Ruppert Stüwe", party: "SPD",
    faction: "SPD (Bundestag 2025 - 2029)", parliamentType: "Bundestag", politicalLevel: "Bund",
    state: "Berlin", constituency: "78 - Berlin-Steglitz-Zehlendorf (Bundestag 2025 - 2029)",
    committees: ["Haushalt"], focusTopics: ["Arbeitsmarkt", "Pflege", "Arbeitsschutz"],
    profileActive: true
  })
]);

// --- Reparaturvorlage: je Feld aktueller Wert -> Vorschlag + Grund + Quelle -----------------
// status: "belegt" = Vorschlag durch offizielle Quelle gedeckt · "zu_bestaetigen" = Befund
// belegt, endgueltiger Wert braucht Betreiber-/Quellenbestaetigung · "entscheidung" =
// Produktentscheidung noetig (kein Datenfix).
const REPARATUREN = Object.freeze([
  Object.freeze({
    id: "annika-klose",
    felder: Object.freeze([
      Object.freeze({
        feld: "committees",
        ist: ["Gesundheit", "Europäische Union", "Kultur und Medien"],
        vorschlag: ["Arbeit und Soziales", "Petitionsausschuss"],
        grund: "Die gespeicherten Ausschuesse entsprechen nicht den WP-21-Mitgliedschaften; falsche Ausschuesse erzeugen falsche Radar-Zustaendigkeitsbelege und ein fehlgeleitetes Ausschuss-Themenradar.",
        quelle: "bundestag.de/abgeordnete/biografien/K/klose_annika-1045438; bundestag.de/ausschuesse/a11_arbeit_soziales (Mitgliederliste WP 21)",
        status: "belegt", abrufdatum: ABRUFDATUM
      }),
      Object.freeze({
        feld: "reportingTopics",
        ist: ["Sprecher/in der Fraktion", "Obmann/Obfrau im Ausschuss"],
        vorschlag: [],
        grund: "Funktionsbezeichnungen sind keine Berichterstatter-THEMEN; sie speisen als Pseudo-Themen die Quellen-Queries (scheduler.topProfileTopics). Funktionen gehoeren nach rolle/function (Sprecherin der Landesgruppe Berlin seit 2023 dorthin uebernehmen, falls gewuenscht).",
        quelle: "bundestag.de/abgeordnete/biografien/K/klose_annika-1045438 (Funktionen vs. Themen)",
        status: "belegt", abrufdatum: ABRUFDATUM
      }),
      Object.freeze({
        feld: "mandatsart (Hinweis, kein Profilfeld)",
        ist: "Wahlkreisfeld suggeriert Direktbezug WK 74",
        vorschlag: "Landeslistenmandat Berlin (WK 74 als betreuter Wahlkreis behalten)",
        grund: "Das Direktmandat Berlin-Mitte ging 2025 an Buendnis 90/Die Gruenen; Klose zog ueber die Landesliste ein. Kein Schemafeld fuer Mandatsart vorhanden — Hinweis fuer die Wahlkreis-Beschriftung.",
        quelle: "tagesspiegel.de (amtliches Wahlergebnis Berlin-Mitte 2025); spdfraktion.de/abgeordnete/klose-annika",
        status: "belegt", abrufdatum: ABRUFDATUM
      })
    ])
  }),
  Object.freeze({
    id: "cem-ince",
    felder: Object.freeze([
      Object.freeze({
        feld: "profiles.name (relationale Zeile)",
        ist: "cem-ince",
        vorschlag: "Cem Ince",
        grund: "LATENTER Mangel: die wirksame Blob-Sicht traegt den Klarnamen, die relationale profiles.name-Zeile nur den Slug. Beim kuenftigen Umschalten auf HELMUT_PROFILE_DB_MODE wuerde die Radar-Personensuche zur Slug-Query degradieren (personNewsSource baut die Query woertlich aus fullName).",
        quelle: "Rein lesende Bestandspruefung 2026-08-04 (Blob vs. profiles/mandate_profiles); Klarname: bundestag.de/abgeordnete/biografien/I/ince_cem-1045160",
        status: "belegt", abrufdatum: ABRUFDATUM
      }),
      Object.freeze({
        feld: "deputyCommittees",
        ist: [],
        vorschlag: ["Wirtschaft und Energie", "Digitales und Staatsmodernisierung"],
        grund: "Qualitaetsergaenzung (empfohlen, kein Blocker): stellvertretende Mitgliedschaften verbessern Zustaendigkeitsbelege.",
        quelle: "dielinkebt.de/abgeordnete/profil/cem-ince; bundestag.de/abgeordnete/biografien/I/ince_cem-1045160",
        status: "belegt", abrufdatum: ABRUFDATUM
      })
    ])
  }),
  Object.freeze({
    id: "helmut-kleebank",
    felder: Object.freeze([
      Object.freeze({
        feld: "committees",
        ist: ["Finanzen", "Haushalt"],
        vorschlag: ["Wirtschaft und Energie", "Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit"],
        grund: "Die gespeicherten Ausschuesse entsprechen nicht den WP-21-Mitgliedschaften (beide seit 21.05.2025); falsche Ausschuesse verfaelschen Radar-Zustaendigkeitsbelege und Matching-Gewichte.",
        quelle: "bundestag.de/abgeordnete/biografien/K/kleebank_helmut-1045402; spdfraktion.de/abgeordnete/kleebank",
        status: "belegt", abrufdatum: ABRUFDATUM
      })
    ])
  }),
  Object.freeze({
    id: "max-mustermann",
    felder: Object.freeze([
      Object.freeze({
        feld: "fullName",
        ist: "Ottilie Paola Klein",
        vorschlag: "(Demo-Klarname entfernen ODER Demo-Mandat deaktivieren/loeschen — OP-04)",
        grund: "Das DEMO-Mandat traegt den Klarnamen einer realen Abgeordneten und erzeugt damit eine zweite, identische Personensuche neben ottilie-paola-klein-2 (Vermischung zwischen Mandaten, doppelte Personenquelle). Kein Datenfix aus offiziellen Quellen moeglich — Produktentscheidung (Demo-Mandate-Entfernung ist offener Punkt OP-04).",
        quelle: "Rein lesende Bestandspruefung 2026-08-04 (Namensduplikat max-mustermann / ottilie-paola-klein-2)",
        status: "entscheidung", abrufdatum: ABRUFDATUM
      })
    ])
  }),
  Object.freeze({
    id: "ottilie-paola-klein-2",
    felder: Object.freeze([
      Object.freeze({
        feld: "committees",
        ist: ["Gesundheit", "Digitales", "Bildung, Forschung und Technikfolgenabschätzung"],
        vorschlag: ["Kultur und Medien"],
        grund: "„Bildung, Forschung und Technikfolgenabschaetzung\" ist ein Ausschuss der 20. Wahlperiode (in der 21. WP aufgeteilt) — nicht aufloesbar gegen die Sollmenge; die WP-21-Mitgliedschaft ist der Ausschuss fuer Kultur und Medien (kulturpolitische Sprecherin der CDU/CSU-Fraktion). Gesundheit/Digitales sind fuer WP 21 nicht belegt.",
        quelle: "cducsu.de/abgeordnete/dr-ottilie-paola-klein; bundestag.de/abgeordnete/biografien/K/klein_ottilie-1045410; Sollmenge: seeds/bundestag-ausschuesse.js (Drs. 21/150)",
        status: "belegt", abrufdatum: ABRUFDATUM
      }),
      Object.freeze({
        feld: "constituency",
        ist: "Berlin",
        vorschlag: "Berlin-Neukölln (betreuter Wahlkreis, Landeslistenmandat Berlin)",
        grund: "„Berlin\" ist kein Wahlkreis; der betreute Wahlkreis ist Berlin-Neukoelln, Einzug ueber die Landesliste Berlin. Praezisiert die Regionale Lage (Quelle Nr. 7) und den Radar-Wahlkreisbezug.",
        quelle: "cdu-neukoelln.de/ottilieklein; bundestag.de/abgeordnete/biografien/K/klein_ottilie-1045410",
        status: "belegt", abrufdatum: ABRUFDATUM
      })
    ])
  }),
  Object.freeze({
    id: "ruppert-st-we",
    felder: Object.freeze([
      Object.freeze({
        feld: "committees",
        ist: ["Haushalt"],
        vorschlag: ["Petitionsausschuss", "Haushalt"],
        grund: "Die WP-21-Mitgliedschaft im Petitionsausschuss (stellv. Sprecher der AG Petitionen) fehlt. Der Status im Haushaltsausschuss (ordentlich vs. stellvertretend seit 21.05.2025; Berichterstattung Einzelplan BMWSB; Mitglied Rechnungspruefungsausschuss) ist in den Quellen uneinheitlich — vor Anwendung bestaetigen.",
        quelle: "ruppert-stuewe.de/ausschuesse; spdfraktion.de/abgeordnete/stuewe; bundestag.de/abgeordnete/biografien/S/stuewe_ruppert-1047638",
        status: "zu_bestaetigen", abrufdatum: ABRUFDATUM
      })
    ])
  })
]);

// Wendet die BELEGTEN Vorschlaege auf eine IST-Repraesentation an (reine Funktion fuer
// Tests — idempotent, veraendert keine Eingabe, schreibt nirgendwohin). Felder mit
// status "entscheidung" oder "zu_bestaetigen" sowie Hinweisfelder werden NICHT angewendet.
function wendeReparaturAn(profil, reparatur) {
  const kopie = { ...profil };
  for (const f of (reparatur && reparatur.felder) || []) {
    if (f.status !== "belegt") continue;
    if (f.feld === "committees") kopie.committees = [...f.vorschlag];
    else if (f.feld === "reportingTopics") kopie.reportingTopics = [...f.vorschlag];
    else if (f.feld === "deputyCommittees") kopie.deputyCommittees = [...f.vorschlag];
    else if (f.feld === "constituency") kopie.constituency = String(f.vorschlag);
    // "profiles.name (relationale Zeile)" betrifft die SQL-Zeile, nicht die wirksame
    // Blob-Sicht (dort steht der Klarname bereits) -> kein Feld-Update der Repraesentation.
  }
  return kopie;
}

module.exports = { ABRUFDATUM, BESTAND_IST, REPARATUREN, wendeReparaturAn };
