"use strict";

// Helmut — Quellenarchitektur · Fachpaket "Innere Sicherheit (Bund)" — VORBEREITUNG.
//
// REINE, DETERMINISTISCHE DATEN + LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN
// Rendering. Formt die amtlich/fachlich verifizierten Kandidaten in das relationale Modell
// (source_packages / publishers / political_entities / retrieval_paths / package_paths /
// path_expected_*) — ausschliesslich als VORBEREITET / TECHNISCH INAKTIV:
//   - retrieval_paths: status "needs_review" (NICHT healthy/active), activation_mode "manual"
//     (NICHT auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - source_package "innere-sicherheit-bund": status "prepared" -> computeGlobalActivation
//     aktiviert es NIE (Referenzzaehlung zaehlt nur aktive Pakete); resolveProfilePackages hat
//     KEINE Regel, die es einem Profil zuordnet -> kein Profil-Mapping.
//
// ISOLATION (bewusst, abweichend vom BE/BB-Landesmodul): Dieses Paket entsteht NACH dem
// bereits angewendeten Basis-Seed (20260713). Es wird deshalb NICHT in seeds/packages.js
// (PACKAGE_DEFINITIONS) eingetragen — das wuerde source-architecture-test.js ("6 Pakete")
// brechen und bei einer Basis-Seed-Regenerierung ein aktives Artefakt veraendern. Statt dessen
// traegt der eigene Seed die source_packages-Zeile selbst. So bleiben packages.js, der
// Basis-Seed, catalog.js und profile-packages.js unveraendert (Auftrag: keine Aenderung an
// Generator-/Registry-/Workflow-Logik; nicht in aktiven Registrierungspfaden).
//
// WIEDERVERWENDUNG statt Parallelwege (Auftrag §11): Die parlamentarische Ebene (Gesetzgebung,
// Drucksachen, Ausschussmaterialien, PKGr-/G10-/Artikel-13-Unterrichtungen) ist bereits ueber
// den bestehenden DIP-Weg `rp-dip` (always_on, Bund Basis) und den Innenausschuss-Suchweg
// `rp-committee-inneres` (Bund Basis) abgedeckt. Beide werden per package_paths REFERENZIERT,
// NICHT dupliziert. Der Refcount bleibt unveraendert (prepared-Paket zaehlt nicht).
//
// VERIFIKATIONS-EHRLICHKEIT (Auftrag §17): Jede neue URL ist amtlich/WebSearch fachlich
// bestaetigt (siehe `confirmedVia`), aber in DIESER Umgebung NICHT byte-genau (lokaler Egress
// zu Behoerden-Domains ist Proxy-seitig gesperrt: CONNECT 403). `byteVerified: false` heisst:
// vor Aktivierung auf einem offenen Egress-Runner (HTTP-Status/Redirect/Content-Type) erneut
// pruefen. Das Datenmodell hat KEIN Verifikations-Schemafeld -> der Zustand lebt hier + in der
// Doku, nicht als erfundene DB-Spalte. `status=needs_review` ist der DB-seitige Pruefmarker.

// --- Paketdefinition (traegt der eigene Seed; NICHT in packages.js) ----------
const PACKAGE = Object.freeze({
  id: "pkg-innere-sicherheit-bund",
  key: "innere-sicherheit-bund",
  name: "Innere Sicherheit (Bund)",
  purpose:
    "Fachthemenpaket bundespolitische Innere Sicherheit: Sicherheitsgesetzgebung/politische " +
    "Steuerung (BMI), Kriminalstatistik & Bundeslagebilder (BKA), Politisch motivierte " +
    "Kriminalitaet (BKA), Verfassungsschutzberichte/Extremismus/Spionage (BfV), " +
    "Datenschutzkontrolle bei Sicherheitsgesetzen (BfDI) sowie — wiederverwendet — DIP und " +
    "Innenausschuss. Struktur vorbereitet, technisch INAKTIV (prepared); Aktivierung freigabepflichtig.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: [] // Fachthemenpaket (keine Landesmodul-Pflichtklassen)
});

// --- Neue politische Entitaeten (nur Behoerden, die NICHT im Basis-Seed stehen) ----
// Wiederverwendet (NICHT neu angelegt): ministry-bmi (Bundesministerium des Innern) existiert
// bereits im Basis-Seed und wird nur referenziert. Konvention wie Basis-Seed: authority ->
// evidence_role data_source; canonical_key null. KEINE Person als Entitaet (Auftrag §4).
const NEUE_ENTITAETEN = [
  {
    id: "authority-bka", entity_type: "authority", name: "Bundeskriminalamt",
    canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["BKA"]
  },
  {
    id: "authority-bfv", entity_type: "authority", name: "Bundesamt für Verfassungsschutz",
    canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["BfV", "Verfassungsschutz"]
  },
  {
    id: "authority-bfdi", entity_type: "authority",
    name: "Bundesbeauftragte für den Datenschutz und die Informationsfreiheit",
    canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["BfDI"]
  }
];

// --- Herausgeber-Metadaten je Domain ----------------------------------------
// entity_id verweist auf die (neue oder bestehende) politische Entitaet. Ein Herausgeber
// existiert genau EINMAL je Domain (Dedup ueber canonical_domain, Auftrag §7.1).
const PUBLISHER_META = {
  "bmi.bund.de": {
    id: "publisher-bmi.bund.de", name: "Bundesministerium des Innern",
    type: "ministry", evidence_role: "official_primary", entity_id: "ministry-bmi" // BESTEHENDE Entitaet
  },
  "bka.de": {
    id: "publisher-bka.de", name: "Bundeskriminalamt",
    type: "authority", evidence_role: "data_source", entity_id: "authority-bka"
  },
  "verfassungsschutz.de": {
    id: "publisher-verfassungsschutz.de", name: "Bundesamt für Verfassungsschutz",
    type: "authority", evidence_role: "data_source", entity_id: "authority-bfv"
  },
  "bfdi.bund.de": {
    id: "publisher-bfdi.bund.de", name: "Bundesbeauftragte für den Datenschutz und die Informationsfreiheit",
    type: "authority", evidence_role: "data_source", entity_id: "authority-bfdi"
  }
};

// --- Bestehende Abrufwege, die WIEDERVERWENDET (referenziert, nicht dupliziert) werden ----
// rp-dip: DIP-API (Bundestag), always_on, Bund Basis — deckt Gesetzgebung, Drucksachen,
//   Ausschussmaterialien und die parlamentarischen Unterrichtungen (PKGr / G-10 / Artikel 13)
//   ueber das Dokumentationssystem ab (Auftrag §5/§11 — kein Parallelweg).
// rp-committee-inneres: Google-News-Suchweg Innenausschuss, Bund Basis — deckt Innenausschuss-
//   Signale (Anhoerungen, Tagesordnungen) ab.
const REUSE_PATHS = [
  { id: "rp-dip", grund: "DIP deckt Gesetzgebung/Drucksachen/Ausschuss + PKGr-/G10-/Artikel-13-Unterrichtungen ab (bestehender always_on-Weg, Bund Basis)." },
  { id: "rp-committee-inneres", grund: "Innenausschuss-Signale (bestehender Suchweg, Bund Basis)." }
];

// --- Neue Abrufwege (5) — amtlich verifizierte, stabile Primaer-/Uebersichtsseiten ----
// Alle: status needs_review, activation_mode manual, prepared. `method: html` = kanonische
// amtliche Uebersichtsseite; die endgueltige Abrufmethode (direktes RSS/HTML vs. site:-Google-
// News-Ersatz — vgl. bundeswege-reparaturen) ist eine Aktivierungs-Entscheidung nach byte-Check.
const KANDIDATEN = [
  {
    id: "rp-isb-bmi-gesetzgebung",
    domain: "bmi.bund.de",
    legacy_source_id: "isb-bmi-gesetzgebung",
    name: "BMI — Sicherheitsgesetzgebung & Strategien (Gesetzgebungsverfahren)",
    method: "html",
    url: "https://www.bmi.bund.de/DE/ministerium/gesetzgebungsverfahren/gesetzgebungsverfahren-artikel.html",
    parser: "html-scrape",
    expected_frequency: "irregular",
    priority: 84,
    is_critical: true,
    max_items: 16,
    tier: 1,
    topics: ["sicherheitsgesetzgebung", "sicherheitsstrategie"],
    verification: { officialConfirmed: true, byteVerified: false, confirmedVia: "WebSearch bmi.bund.de (Gesetzgebungsverfahren-Uebersicht)" }
  },
  {
    id: "rp-isb-bka-statistik-lagebilder",
    domain: "bka.de",
    legacy_source_id: "isb-bka-statistik-lagebilder",
    name: "BKA — Statistiken & Bundeslagebilder (PKS, OK, Cybercrime, Menschenhandel, Rauschgift, Zuwanderung)",
    method: "html",
    url: "https://www.bka.de/DE/AktuelleInformationen/StatistikenLagebilder/statistikenlagebilder_node.html",
    parser: "html-scrape",
    expected_frequency: "annual",
    priority: 86,
    is_critical: true,
    max_items: 16,
    tier: 1,
    // EIN stabiler Weg fuer Statistiken UND Lagebilder (Auftrag §8) — keine kuenstliche
    // Aufteilung einzelner Bundeslagebilder in je eigene Wege. Die abgedeckten Lagebilder
    // stehen als path_expected_topics (inkl. Cybercrime-Lagebild — kriminalpolitische Innere
    // Sicherheit, bleibt bewusst im Paket; allgemeine BSI-Cybersicherheit ist ausgeschlossen).
    topics: ["kriminalstatistik", "organisierte_kriminalitaet", "cybercrime", "menschenhandel", "rauschgiftkriminalitaet", "kriminalitaet_zuwanderung"],
    verification: { officialConfirmed: true, byteVerified: false, confirmedVia: "WebSearch bka.de (Statistiken-und-Lagebilder-Hub; PKS 2025 veroeff. 20.04.2026)" }
  },
  {
    id: "rp-isb-bka-pmk",
    domain: "bka.de",
    legacy_source_id: "isb-bka-pmk",
    name: "BKA — Politisch motivierte Kriminalität (Fallzahlen)",
    method: "html",
    url: "https://www.bka.de/DE/UnsereAufgaben/Deliktsbereiche/PMK/PMKZahlen/PMKZahlen_node.html",
    parser: "html-scrape",
    expected_frequency: "annual",
    priority: 84,
    is_critical: true,
    max_items: 16,
    tier: 2,
    // Eigener PMK-Weg (Auftrag §8, Punkt 2): eigener URL-Baum (/UnsereAufgaben/Deliktsbereiche/
    // PMK/), eigener Jahreszyklus (Fallzahlen 2025 vorgestellt 09.06.2026, getrennt von der PKS),
    // hohe politische Relevanz -> fachlich UND technisch begruendet getrennt von der PKS/Lagebild-
    // Uebersicht. Korrigiert die DeepSeek-Unterschaetzung der PMK.
    topics: ["politisch_motivierte_kriminalitaet", "extremismus"],
    verification: { officialConfirmed: true, byteVerified: false, confirmedVia: "WebSearch bka.de (PMK-Zahlen; 2025 = 85.837 Faelle, 09.06.2026)" }
  },
  {
    id: "rp-isb-bfv-verfassungsschutzberichte",
    domain: "verfassungsschutz.de",
    legacy_source_id: "isb-bfv-verfassungsschutzberichte",
    name: "BfV — Verfassungsschutzberichte & Publikationen (Extremismus, Spionage, hybride Bedrohungen)",
    method: "html",
    url: "https://www.verfassungsschutz.de/DE/service/publikationen/publikationen_node.html",
    parser: "html-scrape",
    expected_frequency: "annual",
    priority: 86,
    is_critical: true,
    max_items: 16,
    tier: 1,
    // Stabile Publikationsuebersicht (Auftrag §9) statt jahresspezifischer Einzel-URL. Der
    // Verfassungsschutzbericht 2025 ist amtlich bestaetigt (veroeff. 30.06.2026, BfV/BMI).
    topics: ["extremismus", "spionageabwehr", "hybride_bedrohungen"],
    verification: { officialConfirmed: true, byteVerified: false, confirmedVia: "WebSearch verfassungsschutz.de (Publikationen-Node; VSB 2025 veroeff. 30.06.2026)" }
  },
  {
    id: "rp-isb-bfdi-taetigkeitsberichte",
    domain: "bfdi.bund.de",
    legacy_source_id: "isb-bfdi-taetigkeitsberichte",
    name: "BfDI — Tätigkeitsberichte & Stellungnahmen (Datenschutz bei Sicherheitsgesetzen)",
    method: "html",
    url: "https://www.bfdi.bund.de/DE/Service/Publikationen/Taetigkeitsberichte/taetigkeitsberichte_node.html",
    parser: "html-scrape",
    expected_frequency: "annual",
    priority: 74,
    is_critical: false,
    max_items: 16,
    tier: 2,
    // Kontrollinstanz (Auftrag §13): periodisch/ereignisbezogen, nicht taeglich. 34. Taetigkeits-
    // bericht 2025 amtlich (uebergeben 06.05.2026). Kein bestehender BfDI-Publisher im Bestand.
    topics: ["datenschutzkontrolle", "ueberwachungsgesetze"],
    verification: { officialConfirmed: true, byteVerified: false, confirmedVia: "WebSearch bfdi.bund.de (Taetigkeitsberichte-Node; 34. TB 2025, 06.05.2026)" }
  }
];

// --- Baut das vorbereitete In-Memory-Abbild (dedup-bewusst, deterministisch) ----
function buildInnereSicherheitBundSeed() {
  const publishers = new Map();
  const retrievalPaths = [];
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];
  const pathExpectedTopics = [];
  const pathExpectedEntities = [];
  const seenPkgPath = new Set();

  function upsertPublisher(domain) {
    const meta = PUBLISHER_META[domain];
    if (!meta) throw new Error(`Unbekannte Publisher-Domain: ${domain}`);
    if (!publishers.has(meta.id)) {
      publishers.set(meta.id, {
        id: meta.id, name: meta.name, canonical_domain: domain,
        publisher_type: meta.type, evidence_role: meta.evidence_role,
        trust: "hoch", lifecycle_status: "active", entity_id: meta.entity_id || null,
        prepared: true
      });
    }
    return meta.id;
  }

  function linkPackagePath(pathId) {
    const key = `${PACKAGE.id}|${pathId}`;
    if (seenPkgPath.has(key)) return;
    seenPkgPath.add(key);
    packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: pathId });
  }

  for (const c of KANDIDATEN) {
    const publisherId = upsertPublisher(c.domain);
    retrievalPaths.push({
      id: c.id,
      publisher_id: publisherId,
      legacy_source_id: c.legacy_source_id,
      name: c.name,
      method: c.method,
      url: c.url,
      query: null,
      parser: c.parser,
      expected_frequency: c.expected_frequency,
      priority: c.priority,
      status: "needs_review",   // VORBEREITET — nie healthy/active
      activation_mode: "manual", // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
      is_critical: !!c.is_critical,
      max_items: c.max_items,
      tier: c.tier,
      verification: c.verification,
      prepared: true
    });
    linkPackagePath(c.id);
    // Erwartete Dimensionen je Abrufweg (Bund) — vom Datenmodell unterstuetzt.
    pathExpectedLevels.push({ retrieval_path_id: c.id, level: "bund" });
    pathExpectedGeographies.push({ retrieval_path_id: c.id, geography_id: "geo-bund" });
    for (const topic of c.topics) pathExpectedTopics.push({ retrieval_path_id: c.id, topic });
    const ent = PUBLISHER_META[c.domain].entity_id;
    if (ent) pathExpectedEntities.push({ retrieval_path_id: c.id, entity_id: ent });
  }

  // Bestehende Wege wiederverwenden (nur package_paths-Referenz; kein neuer retrieval_path,
  // keine path_expected_*-Zeilen fuer sie — sie tragen ihre Dimensionen bereits im Basis-Seed).
  for (const r of REUSE_PATHS) linkPackagePath(r.id);

  const neueWege = retrievalPaths.length;
  return {
    package: PACKAGE,
    entities: NEUE_ENTITAETEN,
    publishers: [...publishers.values()],
    retrievalPaths,
    reusePathIds: REUSE_PATHS.map((r) => r.id),
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedTopics,
    pathExpectedEntities,
    summary: {
      status: PACKAGE.status,
      neuePublisher: publishers.size,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      wiederverwendeteEntitaeten: 1, // ministry-bmi
      neueAbrufwege: neueWege,
      wiederverwendeteAbrufwege: REUSE_PATHS.length,
      paketzuordnungenGesamt: packagePaths.length, // neue + wiederverwendete
      kritischeWege: retrievalPaths.filter((p) => p.is_critical).length,
      tier1: retrievalPaths.filter((p) => p.tier === 1).length,
      tier2: retrievalPaths.filter((p) => p.tier === 2).length,
      // technisch inaktiv: kein neuer Abrufweg ist aktiv/auto/always_on
      aktiveNeueAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length,
      // Verifikations-Ehrlichkeit: kein Weg ist in dieser Umgebung byte-genau bestaetigt
      byteVerifiziert: retrievalPaths.filter((p) => p.verification && p.verification.byteVerified).length
    }
  };
}

module.exports = {
  PACKAGE, NEUE_ENTITAETEN, PUBLISHER_META, REUSE_PATHS, KANDIDATEN,
  buildInnereSicherheitBundSeed
};
