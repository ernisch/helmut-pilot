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
        vorschlag: ["Ausschuss für Arbeit und Soziales"],
        grund: "Die gespeicherten Ausschuesse entsprechen nicht den WP-21-Mitgliedschaften; ordentliches Mitglied ist sie ausschliesslich im Ausschuss fuer Arbeit und Soziales. KORREKTUR 2026-08-04/2: die Erstfassung dieses Pakets schlug zusaetzlich den Petitionsausschuss vor — dessen Mitgliedschaft nennt die amtliche Biografie nur fuer die 20. WP; eine WP-20-Angabe darf nicht als aktuell uebernommen werden.",
        quelle: "bundestag.de/abgeordnete/biografien/K/klose_annika-1045438 (amtliche Biografie, 21. WP)",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
      }),
      Object.freeze({
        feld: "deputyCommittees",
        ist: [],
        vorschlag: ["Finanzausschuss"],
        grund: "Stellvertretendes Mitglied im Finanzausschuss (21. WP) — getrennt vom ordentlichen Sitz zu fuehren (stellvertretende_ausschuesse), nicht in committees.",
        quelle: "bundestag.de/abgeordnete/biografien/K/klose_annika-1045438",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
      }),
      Object.freeze({
        feld: "function",
        ist: "Bundestagsabgeordnete:r",
        vorschlag: "Obfrau im Ausschuss für Arbeit und Soziales",
        grund: "Parlamentarische FUNKTION, kein Ausschuss und kein Thema — gehoert in rolle/function.",
        quelle: "bundestag.de/abgeordnete/biografien/K/klose_annika-1045438",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
      }),
      Object.freeze({
        feld: "reportingTopics",
        ist: ["Sprecher/in der Fraktion", "Obmann/Obfrau im Ausschuss"],
        vorschlag: [],
        grund: "Funktionsbezeichnungen sind keine Berichterstatter-THEMEN; sie speisen als Pseudo-Themen die Quellen-Queries (scheduler.topProfileTopics). Funktionen gehoeren nach rolle/function (siehe eigener function-Eintrag).",
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
        vorschlag: ["Ausschuss für Wirtschaft und Energie", "Ausschuss für Digitales und Staatsmodernisierung"],
        grund: "Qualitaetsergaenzung (empfohlen, kein Blocker): stellvertretende Mitgliedschaften verbessern Zustaendigkeitsbelege. Getrennt vom ordentlichen Sitz (Arbeit und Soziales) gefuehrt.",
        quelle: "dielinkebt.de/abgeordnete/profil/cem-ince (Fraktionsprofil); bundestag.de/abgeordnete/biografien/I/ince_cem-1045160",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang: kanonische Namen)"
      })
    ])
  }),
  Object.freeze({
    id: "helmut-kleebank",
    felder: Object.freeze([
      Object.freeze({
        feld: "committees",
        ist: ["Finanzen", "Haushalt"],
        vorschlag: ["Ausschuss für Wirtschaft und Energie", "Ausschuss für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit"],
        grund: "Die gespeicherten Ausschuesse entsprechen nicht den WP-21-Mitgliedschaften (beide seit 21.05.2025); falsche Ausschuesse verfaelschen Radar-Zustaendigkeitsbelege und Matching-Gewichte.",
        quelle: "bundestag.de/abgeordnete/biografien/K/kleebank_helmut-1045402; spdfraktion.de/abgeordnete/kleebank",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang: kanonische Namen)"
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
        vorschlag: ["Ausschuss für Kultur und Medien", "Ausschuss für Arbeit und Soziales"],
        grund: "„Bildung, Forschung und Technikfolgenabschaetzung\" ist ein Ausschuss der 20. Wahlperiode (in der 21. WP aufgeteilt) — nicht aufloesbar gegen die Sollmenge; Gesundheit/Digitales sind fuer WP 21 nicht belegt. Ordentliche WP-21-Mitgliedschaften sind Kultur und Medien UND Arbeit und Soziales. KORREKTUR 2026-08-04/2: die Erstfassung dieses Pakets nannte nur Kultur und Medien und war unvollstaendig.",
        quelle: "bundestag.de/abgeordnete/biografien/K/klein_ottilie-1045410 (amtliche Biografie, 21. WP); cducsu.de/abgeordnete/dr-ottilie-paola-klein; Sollmenge: seeds/bundestag-ausschuesse.js (Drs. 21/150)",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
      }),
      Object.freeze({
        feld: "deputyCommittees",
        ist: [],
        vorschlag: ["Ausschuss für die Angelegenheiten der Europäischen Union", "Finanzausschuss"],
        grund: "Stellvertretende WP-21-Mitgliedschaften — getrennt vom ordentlichen Sitz zu fuehren (stellvertretende_ausschuesse), nicht in committees.",
        quelle: "bundestag.de/abgeordnete/biografien/K/klein_ottilie-1045410",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
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
        vorschlag: ["Petitionsausschuss"],
        grund: "Ordentliches WP-21-Mitglied ist er im Petitionsausschuss (und im Rechnungspruefungsausschuss, siehe Modellluecken-Eintrag); der Haushaltsausschuss ist eine STELLVERTRETENDE Mitgliedschaft und gehoert nicht in committees. KORREKTUR 2026-08-04/2: die Erstfassung dieses Pakets vermischte ordentliche und stellvertretende Mitgliedschaften (Vorschlag „Petitionsausschuss + Haushalt\").",
        quelle: "bundestag.de/abgeordnete/biografien/S/stuewe_ruppert-1047638 (amtliche Biografie, 21. WP)",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
      }),
      Object.freeze({
        feld: "deputyCommittees",
        ist: [],
        vorschlag: [
          "Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung",
          "Haushaltsausschuss",
          "Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen"
        ],
        grund: "Stellvertretende WP-21-Mitgliedschaften — getrennt vom ordentlichen Sitz zu fuehren (stellvertretende_ausschuesse).",
        quelle: "bundestag.de/abgeordnete/biografien/S/stuewe_ruppert-1047638",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
      }),
      Object.freeze({
        feld: "function",
        ist: "Bundestagsabgeordnete:r",
        vorschlag: "Schriftführer des Deutschen Bundestages",
        grund: "Schriftfuehrer ist eine parlamentarische FUNKTION, kein Fachausschuss — gehoert in rolle/function, nicht in eine Ausschussliste.",
        quelle: "bundestag.de/abgeordnete/biografien/S/stuewe_ruppert-1047638",
        status: "belegt", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
      }),
      Object.freeze({
        feld: "Rechnungsprüfungsausschuss (begrenzte Modelllücke, kein Profilfeld)",
        ist: "ordentliches Mitglied, im Profil nicht abgebildet",
        vorschlag: "(nicht anwenden — im bestehenden Datenmodell nicht sauber abbildbar)",
        grund: "Der Rechnungspruefungsausschuss gehoert NICHT zur Sollmenge der 24 staendigen Ausschuesse des Einsetzungsbeschlusses (Drs. 21/150); `ausschuesse`/`stellvertretende_ausschuesse` werden gegen diese Sollmenge validiert, ein Eintrag dort waere ein falscher Zustaendigkeitsbeleg. Das Datenmodell wird in diesem Sprint nicht geaendert (Auftrag) — die Mitgliedschaft bleibt als dokumentierte Modellluecke offen; abbildbar waere sie perspektivisch nur ueber ein eigenes Gremienfeld (Betreiber-/Architekturentscheidung).",
        quelle: "bundestag.de/abgeordnete/biografien/S/stuewe_ruppert-1047638; Sollmenge: seeds/bundestag-ausschuesse.js",
        status: "entscheidung", abrufdatum: "2026-08-04 (Korrektur 2. Durchgang)"
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
    else if (f.feld === "function") { kopie.function = String(f.vorschlag); kopie.role = String(f.vorschlag); }
    // "profiles.name (relationale Zeile)" betrifft die SQL-Zeile, nicht die wirksame
    // Blob-Sicht (dort steht der Klarname bereits) -> kein Feld-Update der Repraesentation.
    // Hinweis-/Modellluecken-Felder (kein Profilfeld) haben hier bewusst keinen Zweig.
  }
  return kopie;
}

module.exports = { ABRUFDATUM, BESTAND_IST, REPARATUREN, wendeReparaturAn };
