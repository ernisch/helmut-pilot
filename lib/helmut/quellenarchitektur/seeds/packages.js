"use strict";

// Helmut — Neue Quellenarchitektur · Seed: Quellenpakete + Zuordnungslogik.
//
// Pakete buendeln Abrufwege fuer einen klaren Produktzweck (Auftrag §7.4). Ein Abrufweg
// kann in mehreren Paketen sein (m:n via package_paths), wird aber global nur EINMAL
// gecrawlt (Referenzzaehlung in model.js).
//
// Status (Auftrag §30): draft/prepared/active/paused/archived.
//   - active   : im Ist-Katalog real belegt (Bund Basis, Arbeit&Soziales, Die-Linke-Bund,
//                Regional Niedersachsen [Cem], Profil Cem Ince).
//   - prepared : strukturell angelegt, aber (noch) ohne Abrufwege — Berlin/Brandenburg
//                warten auf die Quellenpruefung in Sprint 9 und die Freigabe zur Aktivierung.
//
// is_base: Pflicht-Basispaket. Bundestagsprofil braucht min. Bund Basis; Landtagsprofil
// braucht Bund Basis + sein Landespaket (Auftrag §9).

// Zwingende Quellenklassen je Landesmodul (Auftrag §25/§26/§27) — Grundlage fuer die
// "Pflichtklassen vollstaendig/unvollstaendig"-Anzeige im Admin (Sprint 8).
const LANDESMODUL_PFLICHTKLASSEN = [
  "landesparlament", "plenum", "ausschuesse", "drucksachen", "schriftliche_anfragen",
  "gesetzgebung", "landesregierung", "staatskanzlei", "ministerien", "landesfraktionen",
  "regionale_leitmedien", "oer_landesberichterstattung", "partei_pilot", "fraktion_pilot",
  "person_pilot"
];

const PACKAGE_DEFINITIONS = [
  {
    id: "pkg-bund-basis", key: "bund-basis", name: "Bund Basis",
    purpose: "Neutrale bundespolitische Grundversorgung fuer JEDES Mandat (Institutionen, alle Ausschuesse, alle Fraktionen, Leitmedien, DIP).",
    status: "active", is_base: true, political_level: "bund", geography_id: "geo-bund",
    required_classes: []
  },
  {
    id: "pkg-arbeit-und-soziales", key: "arbeit-und-soziales", name: "Arbeit und Soziales",
    purpose: "Fachthemenpaket Arbeit- und Sozialpolitik (Fachmedien, Verbaende, Gewerkschaften, Prozess-/Radar-Quellen, Themen-Buendel). Fachthema, NICHT Region.",
    status: "active", is_base: false, political_level: "bund", geography_id: "geo-bund",
    required_classes: []
  },
  {
    id: "pkg-die-linke-bund", key: "die-linke-bund", name: "Die Linke Bund",
    purpose: "Partei-Direktquellen Die Linke (Bundesebene).",
    status: "active", is_base: false, political_level: "bund", geography_id: "geo-bund",
    required_classes: []
  },
  {
    id: "pkg-regional-niedersachsen", key: "regional-niedersachsen", name: "Regional Niedersachsen",
    purpose: "Regionale Beobachtung fuer den Piloten Cem (Salzgitter/Braunschweig/Wolfenbuettel/Niedersachsen).",
    status: "active", is_base: false, political_level: "land", geography_id: "geo-land-niedersachsen",
    required_classes: []
  },
  {
    id: "pkg-profil-cem-ince", key: "profil-cem-ince", name: "Persoenliche Beobachtung Cem Ince",
    purpose: "Personenbezogene Nachrichtensuche des Piloten (nur fuer dieses Profil).",
    status: "active", is_base: false, political_level: "bund", geography_id: null,
    required_classes: []
  },
  // --- Strukturell vorbereitete Landesmodule (Auftrag §24/§26/§27), noch OHNE Quellen ---
  {
    id: "pkg-berlin-basis", key: "berlin-basis", name: "Berlin Basis",
    purpose: "Landespaket Berlin (Abgeordnetenhaus, Senat, Senatsverwaltungen, Fraktionen, Regionalmedien, rbb Berlin). Struktur vorbereitet — Quellen folgen nach Pruefung + Freigabe.",
    status: "prepared", is_base: true, political_level: "land", geography_id: "geo-land-berlin",
    required_classes: LANDESMODUL_PFLICHTKLASSEN
  },
  {
    id: "pkg-brandenburg-basis", key: "brandenburg-basis", name: "Brandenburg Basis",
    purpose: "Landespaket Brandenburg (Landtag, Landesregierung, Staatskanzlei, Ministerien, Fraktionen, Regionalmedien, rbb Brandenburg). Struktur vorbereitet — Quellen folgen nach Pruefung + Freigabe.",
    status: "prepared", is_base: true, political_level: "land", geography_id: "geo-land-brandenburg",
    required_classes: LANDESMODUL_PFLICHTKLASSEN
  }
];

// Ableitung: welche Paket-Keys traegt eine Katalog-Quelle (nach ihren Meta-Tags)?
// Reihenfolge trennt Region strikt vom Fachthema (Auftrag §23): eine regionale Quelle
// landet im Regionalpaket, NICHT zusaetzlich im Fachthemenpaket, obwohl sie (durch das
// Alt-Doppel-Gate) themeTerms traegt.
function packageKeysForSource(source = {}) {
  const keys = [];
  if (source.demoOnly) { keys.push("profil-cem-ince"); return keys; }
  if (source.regional) { keys.push("regional-niedersachsen"); return keys; }
  if (source.party && /linke/i.test(source.party)) keys.push("die-linke-bund");
  if (Array.isArray(source.themeTerms) && source.themeTerms.length) keys.push("arbeit-und-soziales");
  if (source.neutral) keys.push("bund-basis");
  return keys;
}

module.exports = { PACKAGE_DEFINITIONS, LANDESMODUL_PFLICHTKLASSEN, packageKeysForSource };
