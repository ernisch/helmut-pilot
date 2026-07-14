"use strict";

// Helmut — Quellenarchitektur · Sprint 9 (Vertiefung): strukturierte VORBEREITUNG der
// Landesmodul-Quellen Berlin & Brandenburg als Herausgeber / Abrufwege / Paketzuordnungen /
// politische Ebenen / Geografien.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Formt die technisch geprüften Kandidaten (seeds/landesmodule-kandidaten.js) in das
// relationale Modell (publishers / retrieval_paths / package_paths / path_expected_*) —
// ausschliesslich als VORBEREITET:
//   - retrieval_paths: status "needs_review" (NICHT healthy/active), activation_mode "manual"
//     (NICHT auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - Zuordnung zu den Landespaketen berlin-basis / brandenburg-basis, die im Katalog
//     status "prepared" tragen -> computeGlobalActivation aktiviert sie NICHT.
//   - path_expected_levels = ["land"], path_expected_geographies = geo-land-berlin/-brandenburg.
// Damit sind Berlin/Brandenburg strukturell vollständig vorbereitet, aber technisch INAKTIV.
// Das Anwenden auf Production (DB-Insert) bleibt ein eigener, ausdrücklich freigabepflichtiger
// Schritt (wie die Bund-Migration). Dieses Modul erzeugt NUR das In-Memory-Abbild + eine
// anwendbare Seed-Struktur; es schreibt nichts.
//
// DEDUP-BEWUSST: Mehrere Pflichtklassen teilen sich EINE Rohquelle (Berlin pardok-wp19.xml
// speist 2/4/5/6; LPD-Feed speist 7/8/9; rbb24 ist für BE UND BB identisch). Es wird je
// EINDEUTIGER (url, method)-Rohquelle EIN Abrufweg erzeugt; die abgedeckten Klassen stehen in
// `covers`. rbb24 ist global genau EIN Abrufweg mit ZWEI Paketreferenzen.

const { LANDESMODUL_KANDIDATEN, LAND_GEOGRAPHY } = require("./landesmodule-kandidaten");

const LAND_PACKAGE = Object.freeze({ berlin: "pkg-berlin-basis", brandenburg: "pkg-brandenburg-basis" });

// Herausgeber-Metadaten je Domain (Name kanonisch + Typ + verknuepfte Entitaet, falls vorhanden).
// entity_id verweist auf seeds/entities.js bzw. auf hier neu benoetigte Landes-Entitaeten.
const PUBLISHER_META = {
  "parlament-berlin.de": { name: "Abgeordnetenhaus von Berlin", type: "parliament", entity_id: "parliament-berlin-agh" },
  "berlin.de": { name: "Land Berlin — Landespressedienst", type: "government", entity_id: "government-berlin-senat" },
  "tagesspiegel.de": { name: "Der Tagesspiegel", type: "media", entity_id: null },
  "rbb24.de": { name: "rbb24 (Rundfunk Berlin-Brandenburg)", type: "media", entity_id: null },
  "dielinke.berlin": { name: "Die Linke Berlin", type: "party", entity_id: "party-linke-berlin" },
  "linksfraktion.berlin": { name: "Linksfraktion Berlin (Abgeordnetenhaus)", type: "parliamentary_group", entity_id: "group-agh-linke" },
  "tobiasschulze.berlin": { name: "Tobias Schulze (MdA, Die Linke)", type: "person", entity_id: "person-tobias-schulze" },
  "landtag.brandenburg.de": { name: "Landtag Brandenburg", type: "parliament", entity_id: "parliament-brandenburg-landtag" },
  "parlamentsdokumentation.brandenburg.de": { name: "Landtag Brandenburg — Parlamentsdokumentation (parldok)", type: "parliament", entity_id: "parliament-brandenburg-landtag" },
  "landesregierung-brandenburg.de": { name: "Landesregierung Brandenburg", type: "government", entity_id: "government-brandenburg" },
  "stk.brandenburg.de": { name: "Staatskanzlei Brandenburg", type: "government", entity_id: "government-brandenburg" },
  "brandenburg.de": { name: "Ministerien Brandenburg", type: "ministry", entity_id: null },
  "maz-online.de": { name: "Märkische Allgemeine / Lausitzer Rundschau", type: "media", entity_id: null },
  "news.google.com": { name: "Google News (Aggregator/Suchweg)", type: "aggregator", entity_id: null },
  "dielinke-brandenburg.de": { name: "Die Linke Brandenburg", type: "party", entity_id: "party-linke-brandenburg" }
};

// Neu benoetigte Landes-Entitaeten (nur solche, die NICHT bereits in seeds/entities.js stehen).
// Bestehende genutzt: parliament-berlin-agh, government-berlin-senat, parliament-brandenburg-landtag,
// government-brandenburg, party-linke. Diese hier ergaenzen die Landesverbaende/Fraktion/Person.
const NEUE_ENTITAETEN = [
  { id: "party-linke-berlin", entity_type: "party", name: "Die Linke Berlin", canonical_key: "linke", level: "land", geography_id: "geo-land-berlin" },
  { id: "group-agh-linke", entity_type: "parliamentary_group", name: "Linksfraktion Berlin (Abgeordnetenhaus)", canonical_key: "linke", level: "land", geography_id: "geo-land-berlin" },
  { id: "person-tobias-schulze", entity_type: "person", name: "Tobias Schulze", canonical_key: "tobias-schulze", level: "land", geography_id: "geo-land-berlin" },
  { id: "party-linke-brandenburg", entity_type: "party", name: "Die Linke Brandenburg", canonical_key: "linke", level: "land", geography_id: "geo-land-brandenburg" }
];

function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, ""); }
function methodToParser(m) {
  return m === "rss" ? "rss-regex"
    : m === "opendata_xml" ? "pardok-xml"
    : m === "api_xml" ? "pardok-xml"
    : m === "googlenews_search" ? "googlenews-batchexecute"
    : m === "html" ? "html-scrape" : null;
}
// Pflicht-Primärquellen eines Landesmoduls (nie still archivieren). Amtliche Parlaments-/Regierungs-
// Rohquellen sind kritisch; Aggregator/Medien/Person nicht.
function isCritical(evidenceRole) { return evidenceRole === "official_primary"; }

// Baut das vorbereitete Landesmodul-Abbild (dedup-bewusst) aus den geprüften Kandidaten.
function buildLandesmodulSeed() {
  const publishers = new Map();     // publisher_id -> publisher
  const pathByKey = new Map();      // `${method}|${url}` -> retrieval_path (global dedup, z. B. rbb24)
  const packagePaths = [];          // {package_id, retrieval_path_id}
  const pathExpectedLevels = [];    // {retrieval_path_id, level}
  const pathExpectedGeographies = [];
  const seenPkgPath = new Set();

  function upsertPublisher(domain) {
    const meta = PUBLISHER_META[domain] || { name: domain, type: "other", entity_id: null };
    const id = domain === "news.google.com" ? "aggregator-google-news" : `publisher-${slug(domain)}`;
    if (!publishers.has(id)) {
      publishers.set(id, {
        id, name: meta.name, canonical_domain: domain, publisher_type: meta.type,
        evidence_role: meta.type === "aggregator" ? "aggregator" : "official_primary",
        trust: "unbekannt", lifecycle_status: "active", entity_id: meta.entity_id || null,
        prepared: true
      });
    }
    return id;
  }

  for (const land of ["berlin", "brandenburg"]) {
    const geoId = LAND_GEOGRAPHY[land];
    const pkgId = LAND_PACKAGE[land];
    for (const c of LANDESMODUL_KANDIDATEN[land]) {
      if (c.readiness === "unbesetzt") continue; // unbesetzte Pilotklassen erzeugen KEINEN Abrufweg
      const publisherId = upsertPublisher(c.domain);
      const key = `${c.method}|${c.url}`;
      let path = pathByKey.get(key);
      if (!path) {
        // legacy_source_id klar landesspezifisch (rbb24 global: eine ID, zwei Paketreferenzen)
        const legacy = c.domain === "rbb24.de" ? "rbb24-politik" : `${land === "berlin" ? "be" : "bb"}-${c.klasse}`;
        path = {
          id: `rp-${legacy}`,
          publisher_id: publisherId,
          legacy_source_id: legacy,
          name: `${c.publisher} — ${c.klasse}`,
          method: c.method,
          url: c.url,
          query: c.method === "googlenews_search" ? c.url : null,
          parser: methodToParser(c.method),
          priority: 60,
          status: "needs_review",       // VORBEREITET — nicht healthy/broken
          activation_mode: "manual",    // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
          is_critical: isCritical(c.evidenceRole),
          max_items: 16,
          covers: [c.klasse],
          landModule: c.domain === "rbb24.de" ? "berlin+brandenburg" : land,
          prepared: true
        };
        pathByKey.set(key, path);
        // Politische Ebene + Geografie je Abrufweg (Landesebene)
        pathExpectedLevels.push({ retrieval_path_id: path.id, level: "land" });
        pathExpectedGeographies.push({ retrieval_path_id: path.id, geography_id: geoId });
      } else if (!path.covers.includes(c.klasse)) {
        path.covers.push(c.klasse); // dedup: dieselbe Rohquelle deckt eine weitere Klasse ab
        if (isCritical(c.evidenceRole)) path.is_critical = true;
      }
      // Paketzuordnung (rbb24 -> beide Pakete, sonst je Landespaket) — dedup gegen Doppel
      const ppKey = `${pkgId}|${path.id}`;
      if (!seenPkgPath.has(ppKey)) { seenPkgPath.add(ppKey); packagePaths.push({ package_id: pkgId, retrieval_path_id: path.id }); }
    }
  }

  const retrievalPaths = [...pathByKey.values()];
  return {
    publishers: [...publishers.values()],
    entities: NEUE_ENTITAETEN,
    retrievalPaths,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    // Ehrliche Kennzahlen der Vorbereitung.
    summary: {
      status: "prepared",
      publishers: publishers.size,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      abrufwege: retrievalPaths.length,
      abrufwegeKritisch: retrievalPaths.filter((p) => p.is_critical).length,
      paketzuordnungen: packagePaths.length,
      rbb24GlobalDedup: retrievalPaths.some((p) => p.legacy_source_id === "rbb24-politik" && p.covers.length >= 1),
      // technisch inaktiv: kein Abrufweg ist aktiv/auto/always_on
      aktiveAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length
    }
  };
}

module.exports = { buildLandesmodulSeed, PUBLISHER_META, NEUE_ENTITAETEN, LAND_PACKAGE };
