"use strict";

// Gemeinsame, KLAR KUENSTLICHE Test-Identitaeten fuer alle Suiten.
// Regel (Mandantenneutralisierung): Tests verwenden NIEMALS echte Personen,
// echte Mandats-IDs oder echte Wahlkreise. Diese Fixtures sind die einzige
// Quelle fuer "vollstaendige" Profil-Testdaten.

// Vollstaendiges Bundestags-Profil (entspricht dem frueheren Code-Seed in der
// STRUKTUR, aber mit rein fiktiven Inhalten).
const testPoliticianOne = {
  id: "test-politician-one",
  fullName: "Test Politician One",
  party: "Testpartei Alpha",
  faction: "Testpartei Alpha",
  function: "Bundestagsabgeordneter",
  role: "Bundestagsabgeordneter",
  politicalLevel: "Bund",
  parliamentType: "Bundestag",
  constituency: "Testkreis Nord",
  state: "Niedersachsen",
  location: "Teststadt",
  committee: "Arbeit und Soziales",
  committees: ["Arbeit und Soziales"],
  committeeUnknown: false,
  focusTopics: [
    "Arbeit",
    "Soziales",
    "Bürgergeld",
    "Rente",
    "Mindestlohn",
    "Tarifbindung",
    "Arbeitsmarkt",
    "Pflege"
  ],
  topicPriorities: {
    Arbeit: 5,
    Soziales: 5,
    Bürgergeld: 5,
    Mindestlohn: 5,
    Rente: 5,
    Pflege: 4,
    Arbeitsmarkt: 5,
    Tarifbindung: 5
  },
  mainQuestion: "Welche Pläne hat die Bundesregierung im Bereich Arbeit und Soziales und worauf sollte ich politisch reagieren?",
  monitoringTargets: ["Meine Partei", "Meine Person", "Mein Fachausschuss", "Bundesregierung Vorhaben"],
  outputNeeds: [
    "Was ist heute wichtig?",
    "Was kann ignoriert werden?",
    "Worauf sollte ich reagieren?"
  ],
  regionalInterests: ["Teststadt", "Testkreis Nord", "Niedersachsen"],
  relevantMinistries: ["BMAS", "Bundesregierung"],
  opponents: ["Testpartei Beta"],
  localMedia: ["Teststadt Zeitung"],
  communicationStyle: "Lösungsorientiert",
  riskTopics: ["Testrisiko eins"],
  opportunityTopics: ["Testchance eins"],
  noGoTopics: ["unbelegte persönliche Angriffe"],
  preferredChannels: ["presse", "linkedin"],
  officeHandoffMethod: "share",
  reportingTopics: ["Arbeit", "Soziales", "Rente"],
  currentCampaigns: ["Testkampagne Gute Arbeit"],
  publicPositions: ["Gute Arbeit braucht Tarifbindung und Kontrolle."],
  keyAudiences: ["Beschäftigte", "Gewerkschaften"],
  upcomingAppointments: [
    "Ausschusssitzung Arbeit und Soziales | 2099-06-26T11:00:00+02:00 | 11:00 | Ausschussmitglieder | Bundestag | Testtermin | Fragen vorbereiten."
  ]
};

// Zweites Mandat fuer Isolations-/Mehrmandanten-Tests (anderes Fachfeld).
const testPoliticianTwo = {
  id: "test-politician-two",
  fullName: "Test Politician Two",
  party: "Testpartei Beta",
  faction: "Testpartei Beta",
  function: "Bundestagsabgeordnete",
  role: "Bundestagsabgeordnete",
  politicalLevel: "Bund",
  parliamentType: "Bundestag",
  constituency: "Testkreis Süd",
  state: "Bayern",
  location: "Testdorf",
  committee: "Gesundheit",
  committees: ["Gesundheit"],
  focusTopics: ["Gesundheit", "Pflegeversicherung", "Digitalisierung"],
  topicPriorities: { Gesundheit: 5, Digitalisierung: 3 },
  monitoringTargets: ["Meine Partei", "Meine Person"],
  regionalInterests: ["Testdorf", "Bayern"],
  relevantMinistries: ["BMG"],
  preferredChannels: ["presse"]
};

// Kurz-Aliase fuer Mandanten-IDs in Isolations-Tests.
const TENANT_ALPHA = "tenant-alpha";
const TENANT_BETA = "tenant-beta";

module.exports = { testPoliticianOne, testPoliticianTwo, TENANT_ALPHA, TENANT_BETA };
