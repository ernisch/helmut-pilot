"use strict";

// Helmut — Neue Quellenarchitektur · Seed: Quellenpakete + Zuordnungslogik.
//
// Pakete buendeln Abrufwege fuer einen klaren Produktzweck (Auftrag §7.4). Ein Abrufweg
// kann in mehreren Paketen sein (m:n via package_paths), wird aber global nur EINMAL
// gecrawlt (Referenzzaehlung in model.js).
//
// Status (Auftrag §30): draft/prepared/active/paused/archived.
//   - active   : im Ist-Katalog real belegt (Bund Basis, Arbeit&Soziales, Die-Linke-Bund,
//                Regional Niedersachsen).
//   - prepared : strukturell angelegt, aber (noch) ohne Abrufwege — Berlin/Brandenburg
//                warten auf die Quellenpruefung in Sprint 9 und die Freigabe zur Aktivierung.
//
// is_base: Pflicht-Basispaket. Bundestagsprofil braucht min. Bund Basis; Landtagsprofil
// braucht Bund Basis + sein Landespaket (Auftrag §9).

// Zwingende Quellenklassen je Landesmodul (Auftrag §25/§26/§27) — Grundlage fuer die
// "Pflichtklassen vollstaendig/unvollstaendig"-Anzeige im Admin (Sprint 8).
//
// P0-2 (Architektur-Audit 29, Neutralisierungs-Sprint): aufgeteilt in eine NEUTRALE Basis-
// Teilmenge (institutionell/geografisch — gehoert ins verpflichtende is_base-Landespaket)
// und eine PARTEI-Teilmenge (Partei/Fraktion/Person-Pilot — gehoert NIEMALS ins is_base-
// Paket, sondern in ein eigenes, optionales Partei-Paket, analog "die-linke-bund" auf
// Bundesebene). LANDESMODUL_PFLICHTKLASSEN bleibt als vollstaendige 15er-Liste (identischer
// Inhalt + Reihenfolge wie zuvor) fuer die Kandidaten-/Reifegrad-Berichterstattung erhalten,
// die klassen- statt paketbezogen zaehlt (seeds/landesmodule-kandidaten.js).
const LANDESMODUL_BASIS_PFLICHTKLASSEN = [
  "landesparlament", "plenum", "ausschuesse", "drucksachen", "schriftliche_anfragen",
  "gesetzgebung", "landesregierung", "staatskanzlei", "ministerien", "landesfraktionen",
  "regionale_leitmedien", "oer_landesberichterstattung"
];
const LANDESMODUL_PARTEI_PFLICHTKLASSEN = ["partei_pilot", "fraktion_pilot", "person_pilot"];
// A-3 (Seed-Fachpruefung, betrieb/quellen-seed-einspielung.md §8.5): Brandenburg traegt NICHT
// dieselben drei Pflichtklassen wie Berlin. Belege aus seeds/landesmodule-kandidaten.js:
//   - fraktion_pilot ist STRUKTURELL unmoeglich: "Die Linke ist in der 8. WP NICHT im Landtag —
//     es gibt keine aktive Linksfraktion. Nur die Partei (partei_pilot) ist valide."
//   - person_pilot bleibt bewusst unbesetzt ("Keine Ersatzperson aus fremder Partei") — und eine
//     Personenquelle entsteht ohnehin zur Laufzeit aus dem Profil (scheduler.personNewsSource,
//     id "<mandats-id>-news") und gehoert in das persoenliche Paket, nicht in ein geteiltes
//     Parteipaket (CLAUDE.md §4.2, Mandantenneutralitaet). Sie kann hier also nie erfuellt werden.
// Beide Klassen als Pflicht zu fuehren erzeugt dauerhaft "falsches Rot" im Landesmodul-Rollup
// (admin-report.js): zwei unerfuellbare Klassen als "fehlend". Die 15er-Gesamtliste
// LANDESMODUL_PFLICHTKLASSEN bleibt fuer die klassenbezogene Kandidaten-/Reifegradzaehlung
// unveraendert — hier geht es nur um die Paket-Pflichtklassen.
const LANDESPARTEI_PFLICHTKLASSEN_BRANDENBURG = ["partei_pilot"];
const LANDESMODUL_PFLICHTKLASSEN = [...LANDESMODUL_BASIS_PFLICHTKLASSEN, ...LANDESMODUL_PARTEI_PFLICHTKLASSEN];

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
    purpose: "Regionale Beobachtung Niedersachsen (Salzgitter/Braunschweig/Wolfenbuettel).",
    status: "active", is_base: false, political_level: "land", geography_id: "geo-land-niedersachsen",
    required_classes: []
  },
  // Persoenliche Pakete ("profil-<mandats-id>") stehen NICHT im Code-Seed:
  // sie werden je Mandat bei der Provisionierung als Datenbank-Zeilen angelegt
  // (bestehende Production-Zeilen bleiben unveraendert gueltig; die Bindung
  // laeuft ueber die Konvention in profile-packages.personalPackageKeyFor).
  // --- Strukturell vorbereitete Landesmodule (Auftrag §24/§26/§27), noch OHNE Quellen ---
  // NEUTRAL: nur institutionelle/geografische Pflichtklassen (P0-2). Partei-/Fraktions-/
  // Personen-Pilotquellen leben NICHT hier, sondern in den eigenen Partei-Paketen unten —
  // jedes Landtagsprofil erhaelt dieses is_base-Paket zwingend, es darf daher keine
  // Partei-/Personenbindung tragen (Auftrag §7.4, Mandantenneutralisierung 40e130f fortgefuehrt).
  {
    id: "pkg-berlin-basis", key: "berlin-basis", name: "Berlin Basis",
    purpose: "Landespaket Berlin (Abgeordnetenhaus, Senat, Senatsverwaltungen, Fraktionen, Regionalmedien, rbb Berlin). Struktur vorbereitet — Quellen folgen nach Pruefung + Freigabe. NEUTRAL: keine Partei-/Personenquellen (siehe pkg-die-linke-berlin).",
    status: "prepared", is_base: true, political_level: "land", geography_id: "geo-land-berlin",
    required_classes: LANDESMODUL_BASIS_PFLICHTKLASSEN
  },
  {
    id: "pkg-brandenburg-basis", key: "brandenburg-basis", name: "Brandenburg Basis",
    purpose: "Landespaket Brandenburg (Landtag, Landesregierung, Staatskanzlei, Ministerien, Fraktionen, Regionalmedien, rbb Brandenburg). Struktur vorbereitet — Quellen folgen nach Pruefung + Freigabe. NEUTRAL: keine Partei-/Personenquellen (siehe pkg-die-linke-brandenburg).",
    status: "prepared", is_base: true, political_level: "land", geography_id: "geo-land-brandenburg",
    required_classes: LANDESMODUL_BASIS_PFLICHTKLASSEN
  },
  // --- Landes-Partei-Pakete (P0-2): Partei-/Fraktions-/Person-Pilot-Quellen, analog
  // "die-linke-bund" auf Bundesebene. NICHT is_base -> kein Mandat erhaelt sie zwingend;
  // ein Mandat der jeweiligen Partei in diesem Land erhaelt das Paket ueber
  // profile-packages.resolveProfilePackages (LANDESPARTEIPAKET_BY_BUNDESLAND).
  {
    id: "pkg-die-linke-berlin", key: "die-linke-berlin", name: "Die Linke Berlin",
    purpose: "Partei-/Fraktions-/Personenquellen Die Linke Berlin (Landesebene). Struktur vorbereitet — Quellen folgen nach Pruefung + Freigabe.",
    status: "prepared", is_base: false, political_level: "land", geography_id: "geo-land-berlin",
    required_classes: LANDESMODUL_PARTEI_PFLICHTKLASSEN
  },
  {
    id: "pkg-die-linke-brandenburg", key: "die-linke-brandenburg", name: "Die Linke Brandenburg",
    purpose: "Parteiquellen Die Linke Brandenburg (Landesebene; 8. WP ohne Landtagsfraktion). Struktur vorbereitet — Quellen folgen nach Pruefung + Freigabe.",
    status: "prepared", is_base: false, political_level: "land", geography_id: "geo-land-brandenburg",
    required_classes: LANDESPARTEI_PFLICHTKLASSEN_BRANDENBURG
  }
];

// Ableitung: welche Paket-Keys traegt eine Katalog-Quelle (nach ihren Meta-Tags)?
// Reihenfolge trennt Region strikt vom Fachthema (Auftrag §23): eine regionale Quelle
// landet im Regionalpaket, NICHT zusaetzlich im Fachthemenpaket, obwohl sie (durch das
// Alt-Doppel-Gate) themeTerms traegt.
function packageKeysForSource(source = {}) {
  const keys = [];
  // Personenquelle (id "<mandats-id>-news"): gehoert per Konvention in das
  // persoenliche Paket "profil-<mandats-id>" — abgeleitet aus der Quelle selbst,
  // kein Mandant im Code.
  if (source.demoOnly) {
    const base = String(source.id || "").replace(/-news$/, "");
    if (base && base !== String(source.id || "")) keys.push(`profil-${base}`);
    return keys;
  }
  if (source.regional) { keys.push("regional-niedersachsen"); return keys; }
  // Partei-Paket: explizites party-Feld ODER der Fraktions-Suchweg der Partei
  // (fraction-linke traegt type "party", aber kein party-Feld — ohne diese Regel
  // enthielte die-linke-bund NUR die zwei defekten Original-RSS-Wege und haette
  // 0 funktionierende Wege; real gemessen in P8 gegen den Production-Snapshot).
  if ((source.party && /linke/i.test(source.party)) || String(source.id || "") === "fraction-linke") {
    keys.push("die-linke-bund");
  }
  if (Array.isArray(source.themeTerms) && source.themeTerms.length) keys.push("arbeit-und-soziales");
  if (source.neutral) keys.push("bund-basis");
  return keys;
}

module.exports = {
  PACKAGE_DEFINITIONS, LANDESMODUL_PFLICHTKLASSEN,
  LANDESMODUL_BASIS_PFLICHTKLASSEN, LANDESMODUL_PARTEI_PFLICHTKLASSEN,
  packageKeysForSource
};
