"use strict";

// Helmut Core — Konfigurations-/Tenant-Modul (V3). Mandantenneutrale Profil-
// Helfer (Ebene, Kontotyp, Vollstaendigkeit) und profilbasierte Entity-Ableitung.
// Trägt KEINE V2-Briefing-Logik mehr (die frühere runtime.js ist entfernt).

// Es gibt bewusst KEIN im Code hinterlegtes Mandatsprofil mehr: Profildaten
// (auch die des Pilotmandanten) leben ausschliesslich als normale Datensaetze
// im Store/der Datenbank (storage.js). Fehlender Mandantenkontext ist ein
// Fehler, kein Anlass fuer einen Personen-Fallback (lib/helmut/tenant-context.js).

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
  // politische_ebene ist ein Enum ('bundestag'/'landtag', siehe storage.js:
  // ausdruecklich NICHT die Kurzform "Bund"). Darum exakte Wort-Erkennung; die
  // ueberbreite startsWith-Kurzform ("Land"/"Bund") bleibt allein dem legacy
  // Freitextfeld politicalLevel unten vorbehalten (sonst matcht "Landkreis" o.ae.).
  const ebene = String(profile.politische_ebene || "").trim().toLowerCase();
  if (ebene.includes("landtag")) return "Landtag";
  if (ebene.includes("bundestag")) return "Bundestag";
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
  // Landtag braucht ein Bundesland: state (UI/Alt) ODER bundesland (mandate_profiles).
  // Muss zu validateProfile passen (dort ebenfalls state ODER bundesland akzeptiert),
  // sonst meldet profileCompleteness faelschlich "state fehlt" bei gesetztem bundesland.
  if (parliamentTypeOf(profile) === "Landtag" && !hasStr(profile.state) && !hasStr(profile.bundesland)) missing.push("state");

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
  inferEntities,
  parliamentTypeOf,
  accountTypeOf,
  profileCompleteness
};
