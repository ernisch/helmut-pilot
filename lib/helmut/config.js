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

// --- Mandatsprofil: politische Ebene, Kontotyp, Vollstaendigkeit -------------
// EINE gemeinsame Definition fuer Server (Read) und Scheduler (Ingestion), damit
// "Profil vollstaendig?" ueberall gleich beurteilt wird. KEINE Person als Standard:
// diese Helfer lesen ausschliesslich Profilfelder, nie ein fremdes Profil.

// Politische Ebene aus dem Profil ableiten (robust gegen Alt- UND aktuelles DB-Feld).
// Reihenfolge: explizites parliamentType (Alt-/UI-Feld) -> politische_ebene (mandate_profiles,
// aktuelles verbindliches Profilmodell, Werte 'bundestag'/'landtag') -> politicalLevel (Alt).
// Additiv: bestehende Formate bleiben unveraendert; ein bisher nur lokal (Quellenarchitektur)
// erkanntes politische_ebene wird jetzt ZENTRAL ausgewertet (keine lokale Umgehung mehr).
function parliamentTypeOf(profile = {}) {
  const explicit = String(profile.parliamentType || "").trim().toLowerCase();
  if (explicit.includes("landtag")) return "Landtag";
  if (explicit.includes("bundestag")) return "Bundestag";
  const ebene = String(profile.politische_ebene || "").trim().toLowerCase();
  if (ebene.includes("landtag") || ebene.startsWith("land")) return "Landtag";
  if (ebene.includes("bundestag") || ebene.startsWith("bund")) return "Bundestag";
  const level = String(profile.politicalLevel || "").trim().toLowerCase();
  if (level.startsWith("land")) return "Landtag";   // "Land", "Landesregierung"
  if (level.startsWith("bund")) return "Bundestag"; // "Bund", "Bundesregierung"
  return "";
}

// Kontotyp (aktuell aktiv genutzt: "abgeordneter"). Pressestelle -> ministerium.
function accountTypeOf(profile = {}) {
  const t = String(profile.accountType || "").trim().toLowerCase();
  if (["abgeordneter", "fraktion", "organisation", "ministerium", "pressestelle"].includes(t)) {
    return t === "pressestelle" ? "ministerium" : t;
  }
  return "abgeordneter";
}

function hasList(v) { return Array.isArray(v) && v.some((x) => String(x || "").trim()); }
function hasObj(v) { return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0; }
function hasStr(v) { return String(v || "").trim().length > 0; }

// Beurteilt, ob ein Account genug Angaben hat, damit Helmut sinnvoll personalisiert.
// level: "full" | "restricted" | "empty". restricted = Person/Partei vorhanden, aber
// zu wenig fuer starke Personalisierung -> Helmut raet NICHT und nutzt KEIN fremdes Profil.
function profileCompleteness(profile = {}) {
  const missing = [];
  if (!hasStr(profile.fullName)) missing.push("fullName");
  if (!hasStr(profile.party) && !hasStr(profile.faction)) missing.push("party");
  const hasCommittee = hasStr(profile.committee) || hasList(profile.committees);
  const hasTopics = hasList(profile.focusTopics) || hasObj(profile.topicPriorities);
  if (!hasCommittee && !hasTopics) missing.push("committee_or_topics");
  if (parliamentTypeOf(profile) === "Landtag" && !hasStr(profile.state)) missing.push("state");

  const hasIdentity = hasStr(profile.fullName) || hasStr(profile.party);
  const level = missing.length === 0 ? "full" : (hasIdentity ? "restricted" : "empty");
  return {
    complete: missing.length === 0,
    restricted: level === "restricted",
    empty: level === "empty",
    level,
    missing,
    parliamentType: parliamentTypeOf(profile),
    accountType: accountTypeOf(profile)
  };
}

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

module.exports = {
  cemInceProfile,
  inferEntities,
  parliamentTypeOf,
  accountTypeOf,
  profileCompleteness
};
