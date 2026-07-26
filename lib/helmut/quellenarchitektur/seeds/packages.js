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
const LANDESMODUL_PFLICHTKLASSEN = [...LANDESMODUL_BASIS_PFLICHTKLASSEN, ...LANDESMODUL_PARTEI_PFLICHTKLASSEN];

// Pflichtklassen der BUNDES-/Regionalpakete (Phase-1-Punkt 13). Bis hierher trugen diese vier
// Pakete `required_classes: []` — es gab also KEIN maschinell pruefbares
// Vollstaendigkeitskriterium, "fachlich vollstaendig" war weder belegt noch widerlegt
// (`docs/quellenarchitektur/30-paket-inventur-production.md` §4).
//
// Die Listen sind 1:1 aus dem `purpose` des jeweiligen Pakets und dem Herkunftsblock in
// `lib/helmut/sources.js` abgeleitet — keine erfundene Anforderung. Die Klassen selbst werden
// deterministisch aus den committeten Katalogmerkmalen abgeleitet
// (`quellenarchitektur/paket-vollstaendigkeit.js` -> catalogPathClasses), nicht aus einer
// Namensliste. Ausfuehrbar gepruefte Erweiterung dort: Pflicht-Herausgeberklassen
// (evidence_role), Vollzaehligkeit ("alle Ausschuesse"/"alle Fraktionen") und begruendete
// Mehrfachzuordnungen.
const BUND_BASIS_PFLICHTKLASSEN = [
  "parlament_bund", "regierung_bund", "bundestagsausschuesse", "bundestagsfraktionen",
  "allgemeine_bundespolitik", "leitmedien_bund", "parlamentsdokumentation"
];
const ARBEIT_SOZIALES_PFLICHTKLASSEN = [
  "fachministerium", "bundestagsausschuesse", "fachparlamentsvorgaenge", "fachmedien",
  "verbaende_gewerkschaften", "amtliche_daten", "prozessquellen", "themenradar",
  "themenbuendel", "mediensignale"
];
const PARTEIPAKET_BUND_PFLICHTKLASSEN = ["parteiquellen_bund"];
const REGIONALPAKET_PFLICHTKLASSEN = ["regionalquellen"];

// Geografischer Geltungsbereich der REGIONS-Pakete als Teil der Paketdefinition.
// Vorher lag diese Liste nur im Profil-Resolver — dadurch war die Region des Pakets aus dem
// Paket selbst nicht ableitbar, und `packageKeysForSource` ordnete JEDE regionale Quelle dem
// Niedersachsen-Paket zu (mit HELMUT_SOURCE_CURATION=off waeren das 30 fremde Regionalquellen
// gewesen — gemessen). Die Begriffe sind unveraendert uebernommen; `profile-packages.js` liest sie jetzt
// von hier, damit Zuordnung und Paketdefinition nicht auseinanderlaufen koennen.
const REGION_TERMS_BY_PACKAGE = {
  "regional-niedersachsen": [
    "niedersachsen", "salzgitter", "wolfenbuettel", "wolfenbüttel", "braunschweig",
    "goslar", "peine", "helmstedt", "hannover", "hildesheim", "wolfsburg", "harz"
  ]
};

const PACKAGE_DEFINITIONS = [
  {
    id: "pkg-bund-basis", key: "bund-basis", name: "Bund Basis",
    purpose: "Neutrale bundespolitische Grundversorgung fuer JEDES Mandat (Institutionen, alle Ausschuesse, alle Fraktionen, Leitmedien, DIP).",
    status: "active", is_base: true, political_level: "bund", geography_id: "geo-bund",
    required_classes: BUND_BASIS_PFLICHTKLASSEN
  },
  {
    id: "pkg-arbeit-und-soziales", key: "arbeit-und-soziales", name: "Arbeit und Soziales",
    purpose: "Fachthemenpaket Arbeit- und Sozialpolitik (Fachmedien, Verbaende, Gewerkschaften, Prozess-/Radar-Quellen, Themen-Buendel). Fachthema, NICHT Region.",
    status: "active", is_base: false, political_level: "bund", geography_id: "geo-bund",
    required_classes: ARBEIT_SOZIALES_PFLICHTKLASSEN
  },
  {
    id: "pkg-die-linke-bund", key: "die-linke-bund", name: "Die Linke Bund",
    purpose: "Partei-Direktquellen Die Linke (Bundesebene).",
    status: "active", is_base: false, political_level: "bund", geography_id: "geo-bund",
    required_classes: PARTEIPAKET_BUND_PFLICHTKLASSEN
  },
  {
    id: "pkg-regional-niedersachsen", key: "regional-niedersachsen", name: "Regional Niedersachsen",
    purpose: "Regionale Beobachtung Niedersachsen (Salzgitter/Braunschweig/Wolfenbuettel).",
    status: "active", is_base: false, political_level: "land", geography_id: "geo-land-niedersachsen",
    required_classes: REGIONALPAKET_PFLICHTKLASSEN
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
    required_classes: LANDESMODUL_PARTEI_PFLICHTKLASSEN
  }
];

// Normalisierung fuer den Regionsabgleich (Umlaute falten, damit "wolfenbuettel" und
// "wolfenbüttel" denselben Treffer ergeben).
function normRegion(value) {
  return String(value == null ? "" : value).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\s+/g, " ").trim();
}

// Welches REGIONS-Paket deckt diese regionale Quelle ab? Der Abgleich laeuft ueber die
// Regionsbegriffe der Paketdefinition (REGION_TERMS_BY_PACKAGE) gegen Id und Namen der Quelle.
// Ohne Treffer bleibt die Quelle absichtlich OHNE Paket (buildCatalog fuehrt sie in `unmapped`):
// eine bayerische Regionalquelle darf nicht im Niedersachsen-Paket landen.
function regionalPackageKeyForSource(source = {}) {
  const haystack = `${normRegion(source.id)} ${normRegion(source.name)}`;
  for (const [key, terms] of Object.entries(REGION_TERMS_BY_PACKAGE)) {
    if (terms.some((term) => haystack.includes(normRegion(term)))) return key;
  }
  return "";
}

// Institutioneller Ausschuss-Abrufweg? Erkennung ueber die STABILE Ausschusskennung
// (`ausschussKey`), die der Katalog aus der externen Sollmenge
// (seeds/bundestag-ausschuesse.js) uebernimmt — nicht ueber den Namen.
//
// Warum nicht ueber den Namen: fuenf der 24 staendigen Ausschuesse tragen die
// Institutionsbezeichnung im Wort selbst ("Auswärtiger Ausschuss", "Petitionsausschuss",
// "Finanzausschuss", "Haushaltsausschuss", "Verteidigungsausschuss") und beginnen NICHT mit
// "Ausschuss ". Eine Namensverankerung haette diese fuenf uebersehen. Umgekehrt tragen die 25
// Themen-x-Kontext-Buendel denselben `type: "committee"` — sie haben aber keinen
// `ausschussKey` und fallen damit korrekt heraus.
function isInstitutionellerAusschuss(source = {}) {
  return String(source.type || "") === "committee" && !!String(source.ausschussKey || "").trim();
}

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
  if (source.regional) {
    const regionKey = regionalPackageKeyForSource(source);
    if (regionKey) keys.push(regionKey);
    return keys;
  }
  // Partei-Paket: explizites party-Feld ODER der Fraktions-Suchweg der Partei
  // (fraction-linke traegt type "party", aber kein party-Feld — ohne diese Regel
  // enthielte die-linke-bund NUR die zwei defekten Original-RSS-Wege und haette
  // 0 funktionierende Wege; real gemessen in P8 gegen den Production-Snapshot).
  if ((source.party && /linke/i.test(source.party)) || String(source.id || "") === "fraction-linke") {
    keys.push("die-linke-bund");
  }
  if (Array.isArray(source.themeTerms) && source.themeTerms.length) keys.push("arbeit-und-soziales");
  if (source.neutral) keys.push("bund-basis");
  // Punkt 13: "alle Ausschuesse" ist eine VOLLZAEHLIGKEITS-Zusage des neutralen
  // Pflicht-Basispakets. Ein staendiger Bundestagsausschuss gehoert deshalb IMMER in
  // bund-basis — auch wenn er (wie der Ausschuss fuer Arbeit und Soziales) zusaetzlich die
  // Kernquelle eines Fachthemenpakets ist. Ohne diese Regel fehlte genau der Ausschuss im
  // Pflichtpaket, in dem der Pilotmandant sitzt: jedes andere Mandat haette 22 von 23
  // Ausschuessen bekommen, und die Luecke haette der Profilform des Piloten gefolgt.
  if (isInstitutionellerAusschuss(source) && !keys.includes("bund-basis")) keys.push("bund-basis");
  return keys;
}

module.exports = {
  PACKAGE_DEFINITIONS, LANDESMODUL_PFLICHTKLASSEN,
  LANDESMODUL_BASIS_PFLICHTKLASSEN, LANDESMODUL_PARTEI_PFLICHTKLASSEN,
  BUND_BASIS_PFLICHTKLASSEN, ARBEIT_SOZIALES_PFLICHTKLASSEN,
  PARTEIPAKET_BUND_PFLICHTKLASSEN, REGIONALPAKET_PFLICHTKLASSEN,
  REGION_TERMS_BY_PACKAGE,
  packageKeysForSource, regionalPackageKeyForSource, isInstitutionellerAusschuss
};
