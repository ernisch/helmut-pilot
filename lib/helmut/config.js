"use strict";

// Helmut Core — Konfigurations-/Tenant-Modul (V3). Neutraler Platz für die
// Single-Tenant-Profildaten und eine profilbasierte Entity-Ableitung. Trägt KEINE
// V2-Briefing-Logik mehr (die frühere runtime.js ist entfernt).

const cemInceProfile = {
  id: "cem-ince",
  fullName: "Cem Ince",
  party: "Die Linke",
  faction: "Die Linke",
  function: "Bundestagsabgeordneter",
  role: "Bundestagsabgeordneter",
  politicalLevel: "Bund",
  constituency: "Salzgitter-Wolfenbüttel",
  state: "Niedersachsen",
  location: "Salzgitter",
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
    "Pflege",
    "Sozialstaat",
    "Armut",
    "Gewerkschaften",
    "Tariftreue",
    "Arbeitszeit",
    "Industriearbeitsplätze",
    "Pflegeversicherung",
    "Bundesregierung Vorhaben im Bereich Arbeit und Soziales"
  ],
  topicPriorities: {
    Arbeit: 5,
    Soziales: 5,
    Bürgergeld: 5,
    Mindestlohn: 5,
    Pflege: 4,
    Wohnen: 2,
    Migration: 2,
    Bildung: 2,
    Klima: 1,
    Energie: 2,
    Digitalisierung: 2,
    Außenpolitik: 1,
    Verteidigung: 1,
    Europa: 2,
    Familie: 3,
    Rente: 5,
    Gesundheit: 3,
    Arbeitszeit: 4,
    Tariftreue: 5,
    Tarifbindung: 5,
    Arbeitsmarkt: 5,
    Gewerkschaften: 5,
    Industriearbeitsplätze: 4,
    Pflegeversicherung: 4,
    Niedersachsen: 3
  },
  mainQuestion: "Welche Pläne hat die Bundesregierung im Bereich Arbeit und Soziales und worauf sollte ich politisch reagieren?",
  monitoringTargets: ["Meine Partei", "Meine Person", "Mein Fachausschuss", "Bundesregierung Vorhaben", "Arbeit und Soziales"],
  outputNeeds: [
    "Was ist heute wichtig?",
    "Was kann ignoriert werden?",
    "Worauf sollte ich reagieren?",
    "Welche Chance entsteht?",
    "Welches Risiko entsteht?",
    "Welche Formulierung kann ich nutzen?"
  ],
  regionalInterests: [
    "Salzgitter",
    "Wolfenbüttel",
    "Niedersachsen",
    "lokale Beschäftigung",
    "Industriearbeitsplätze",
    "VW-Beschäftigte",
    "Betriebsräte",
    "Stahlindustrie",
    "Pflegeversorgung",
    "Armutsbekämpfung",
    "Tarifbindung vor Ort"
  ],
  relevantMinistries: ["BMAS", "BMG", "BMF", "Bundesregierung"],
  opponents: ["CDU/CSU", "SPD-Regierungslinie", "FDP", "AfD"],
  localMedia: [
    "Salzgitter Zeitung",
    "Braunschweiger Zeitung",
    "Wolfsburger Nachrichten",
    "NDR Niedersachsen",
    "Hannoversche Allgemeine",
    "taz",
    "nd"
  ],
  communicationStyle: "Lösungsorientiert",
  riskTopics: [
    "Bürgergeld-Sanktionsframe",
    "Renten- und Sozialstaatsdebatten ohne linke Linie",
    "Angriffe auf soziale Sicherung",
    "Angriffe auf Erwerbslose",
    "fehlende Tarifkontrollen",
    "zu späte Reaktion auf BMAS-Vorhaben"
  ],
  opportunityTopics: [
    "BMAS Vorhaben früh einordnen",
    "Tariftreue",
    "Mindestlohn",
    "gute Arbeit",
    "Pflegearbeitsbedingungen",
    "Rente für niedrige Einkommen"
  ],
  noGoTopics: ["unbelegte persönliche Angriffe", "verkürzte Kulturkampf-Frames", "unklare Forderungen ohne Handlungsvorschlag"],
  preferredChannels: ["presse", "linkedin", "x", "ausschuss", "buergerdialog"],
  officeHandoffMethod: "share",
  reportingTopics: ["Arbeit", "Soziales", "Bürgergeld", "Mindestlohn", "Rente", "Pflege", "Tariftreue", "Arbeitszeit"],
  currentCampaigns: [
    "Gute Arbeit und Tarifbindung",
    "Armutsfester Sozialstaat",
    "Mindestlohn und Respekt für Beschäftigte",
    "Pflege sozial absichern"
  ],
  publicPositions: [
    "Gute Arbeit braucht Tarifbindung und Kontrolle.",
    "Soziale Sicherung darf Menschen nicht unter Generalverdacht stellen.",
    "Pflege braucht verlässliche Arbeitsbedingungen."
  ],
  keyAudiences: ["Beschäftigte", "Gewerkschaften", "Sozialverbände", "Pflegekräfte", "Menschen mit niedrigen Einkommen"],
  upcomingAppointments: [
    "Ausschusssitzung Arbeit und Soziales | 2026-06-26T11:00:00+02:00 | 11:00 | Ausschussmitglieder | Bundestag | Aktuelle Vorhaben der Bundesregierung zu Arbeit und Soziales | Fragen zu Rente, Bürgergeld und Tariftreue vorbereiten.",
    "Telefonat mit Gewerkschaft und Betriebsräten | 2026-06-27T09:30:00+02:00 | 09:30 | Betriebsräte und Gewerkschaftssekretärinnen | Gewerkschaft | Tarifbindung, Mindestlohn, Industriearbeitsplätze | Gesprächspunkte zu Tariftreue, VW-Zulieferern und Kontrollen vorbereiten.",
    "Gespräch mit Sozialverband | 2026-06-30T14:00:00+02:00 | 14:00 | Sozialverband | Sozialverband | Bürgergeld, Armut, Rente | Regierungslinie, soziale Auswirkungen und mögliche Anfrage vorbereiten.",
    "Wahlkreiszeit Salzgitter | 2026-07-01T10:00:00+02:00 | 10:00 | Bürgerinnen, Initiativen, lokale Presse | Wahlkreis | Arbeit, Pflege, soziale Sicherheit vor Ort | Lokale Gesprächspunkte und eine kurze Presselinie vorbereiten."
  ]
};

const GENERIC_ENTITIES = ["Bundestag", "Bundesregierung"];

function inferEntities(item, profile = null) {
  const text = `${item.title} ${item.content}`;
  const profileEntities = profile
    ? [profile.fullName, profile.party, profile.faction,
       ...(profile.committees || []), ...(profile.relevantMinistries || []), ...(profile.opponents || [])]
    : [];
  const candidates = [...profileEntities, ...GENERIC_ENTITIES]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const entities = candidates.filter((entity) => text.includes(entity));
  // Personentreffer ueber den Nachnamen des Mandats (falls Profil vorhanden) oder
  // die Demo-Personenquelle. Keine hardcodierten Namen.
  const lastName = String(profile?.fullName || "").split(" ").filter(Boolean).pop() || "";
  if (profile?.fullName && lastName) {
    const escaped = lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if ((new RegExp(`\\b${escaped}\\b`).test(text) || item.sourceId === "source-person") && !entities.includes(profile.fullName)) {
      entities.push(profile.fullName);
    }
  }
  return Array.from(new Set(entities));
}

module.exports = { cemInceProfile, inferEntities };
