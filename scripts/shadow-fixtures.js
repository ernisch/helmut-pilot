"use strict";

// Gemeinsame Fixtures fuer die Sprint-4-Shadow-Tests. KEINE Testsuite (wird vom Offline-Runner
// NICHT eingesammelt — Dateiname endet nicht auf -test.js). Repraesentative, synthetische Master-
// Records + Mandate; KEINE realen Personen, KEINE Produktionsdaten.

const shadow = require("../lib/helmut/quellenarchitektur/shadow");

// Repraesentativer Master-Katalog (Sprint-3-Record-Form) mit Partei-, Fraktions-, Ausschuss-,
// Themen-, Regional- und universalen Quellen + einer reinen Suchanbieter-Partei-Quelle.
function buildFixtureCatalog() {
  return [
    { id: "src-basis-bt", publisher_id: "publisher-bundestag.de", source_type: "parlament", political_level: "bund", universal: true, retrieval: { method: "rss", url: "https://www.bundestag.de/rss", expected_frequency: "daily" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" },
    { id: "src-dip", publisher_id: "publisher-dip.bundestag.de", source_type: "parlament", political_level: "bund", universal: true, retrieval: { method: "api", url: "https://search.dip.bundestag.de/api" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" },
    // Parteien/Fraktionen
    { id: "src-linke", publisher_id: "publisher-die-linke.de", source_type: "fraktion", political_level: "bund", party_id: "linke", group_id: "linke", retrieval: { method: "rss", url: "https://www.die-linke.de/feed" }, trust: "mittel", review_status: "active", license_status: "presse_erlaubt" },
    { id: "src-spd", publisher_id: "publisher-spd.de", source_type: "partei", political_level: "bund", party_id: "spd", group_id: "spd", retrieval: { method: "rss", url: "https://www.spd.de/feed" }, trust: "mittel", review_status: "active", license_status: "presse_erlaubt" },
    { id: "src-gruene", publisher_id: "publisher-gruene.de", source_type: "partei", political_level: "bund", party_id: "gruene", group_id: "gruene", retrieval: { method: "rss", url: "https://www.gruene.de/feed" }, trust: "mittel", review_status: "active", license_status: "presse_erlaubt" },
    // Ausschuss/Themen
    { id: "src-bmas", publisher_id: "publisher-bmas.de", source_type: "ministerium", political_level: "bund", committee_ids: ["arbeit-und-soziales"], topics: ["arbeit-und-soziales"], retrieval: { method: "rss", url: "https://www.bmas.de/rss" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" },
    { id: "src-bmg", publisher_id: "publisher-bmg.de", source_type: "ministerium", political_level: "bund", committee_ids: ["gesundheit"], topics: ["gesundheit"], retrieval: { method: "rss", url: "https://www.bmg.de/rss" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" },
    // Region
    { id: "src-nds", publisher_id: "publisher-braunschweiger-zeitung.de", source_type: "medien_regional", political_level: "land", region_ids: ["niedersachsen"], retrieval: { method: "rss", url: "https://www.bz.de/rss" }, trust: "mittel", review_status: "active", license_status: "eingeschraenkt" },
    { id: "src-bayern", publisher_id: "publisher-br.de", source_type: "medien_regional", political_level: "land", region_ids: ["bayern"], retrieval: { method: "rss", url: "https://www.br.de/rss" }, trust: "hoch", review_status: "active", license_status: "presse_erlaubt" },
    // Reine Suchanbieter-Quelle fuer eine Partei (fuer den Google-News-Alleinversorgungs-Fall)
    { id: "src-afd-gn", publisher_id: "aggregator-google-news", source_type: "suchanbieter", political_level: "bund", party_id: "afd", group_id: "afd", retrieval: { method: "googlenews_search", url: "https://news.google.com/rss/search?q=AfD" }, trust: "niedrig", review_status: "active", license_status: "presse_erlaubt" },
    // Untersagte Quelle (muss ausgeschlossen werden)
    { id: "src-untersagt", publisher_id: "publisher-verboten.de", source_type: "medien_regional", political_level: "bund", topics: ["arbeit-und-soziales"], retrieval: { method: "rss", url: "https://verboten.de/rss" }, trust: "mittel", review_status: "active", license_status: "untersagt" }
  ];
}

// Injizierte Gesundheits-Telemetrie (technisch, kein PII) — macht Health-Daten fuer Tests verfuegbar.
function buildHealthTelemetry() {
  return [
    { source_id: "src-basis-bt", status: "ok", finished_at: "2026-07-20T10:00:00Z" },
    { source_id: "src-dip", status: "ok", finished_at: "2026-07-20T10:00:00Z" },
    { source_id: "src-linke", status: "ok", finished_at: "2026-07-20T10:00:00Z" },
    { source_id: "src-spd", status: "ok", finished_at: "2026-07-20T10:00:00Z" },
    { source_id: "src-gruene", status: "ok", finished_at: "2026-07-20T10:00:00Z" },
    { source_id: "src-bmas", status: "ok", finished_at: "2026-07-20T10:00:00Z" },
    { source_id: "src-bmg", status: "ok", finished_at: "2026-07-20T10:00:00Z" },
    { source_id: "src-nds", status: "ok", finished_at: "2026-07-20T10:00:00Z" },
    { source_id: "src-bayern", status: "ok", finished_at: "2026-07-20T10:00:00Z" }
  ];
}

// Baut einen Shadow-Kontext aus den Fixtures (optional mit Health-Daten).
function buildFixtureContext(opts = {}) {
  return shadow.buildShadowContext({
    catalog: { records: buildFixtureCatalog() },
    health: opts.withHealth ? { telemetry: buildHealthTelemetry() } : {}
  });
}

// Die 14 repraesentativen Mandatsfaelle (Aufgabe 4). KEINE reale Person, KEINE Sonderlogik.
function representativeMandates() {
  return [
    { key: "partei-linke", profile: { id: "m01", partei: "Die Linke", fraktion: "Die Linke", mandatsebene: "Bundestag", bundesland: "Berlin", ausschuesse: ["Arbeit und Soziales"] } },
    { key: "partei-spd", profile: { id: "m02", partei: "SPD", fraktion: "SPD", mandatsebene: "Bundestag", bundesland: "Nordrhein-Westfalen", ausschuesse: ["Gesundheit"] } },
    { key: "fraktion-gruene", profile: { id: "m03", partei: "Grüne", fraktion: "Bündnis 90/Die Grünen", mandatsebene: "Bundestag", bundesland: "Baden-Württemberg", ausschuesse: ["Gesundheit"] } },
    { key: "bundesland-bayern", profile: { id: "m04", partei: "SPD", mandatsebene: "Landtag", bundesland: "Bayern", ausschuesse: ["Arbeit und Soziales"] } },
    { key: "bundesland-nds", profile: { id: "m05", partei: "SPD", mandatsebene: "Landtag", bundesland: "Niedersachsen", ausschuesse: ["Gesundheit"] } },
    { key: "mehrere-ausschuesse", profile: { id: "m06", partei: "SPD", fraktion: "SPD", mandatsebene: "Bundestag", bundesland: "Berlin", ausschuesse: ["Arbeit und Soziales", "Gesundheit"] } },
    { key: "direktmandat", profile: { id: "m07", partei: "SPD", fraktion: "SPD", mandatsebene: "Bundestag", bundesland: "Niedersachsen", wahlkreis: "Salzgitter", mandatstyp: "Direktmandat", ausschuesse: ["Arbeit und Soziales"] } },
    { key: "listenmandat", profile: { id: "m08", partei: "Grüne", fraktion: "Bündnis 90/Die Grünen", mandatsebene: "Bundestag", bundesland: "Bayern", mandatstyp: "Listenmandat", ausschuesse: ["Gesundheit"] } },
    { key: "fuehrungsfunktion", profile: { id: "m09", partei: "SPD", fraktion: "SPD", mandatsebene: "Bundestag", bundesland: "Berlin", funktion: "Fraktionsvorsitz", ausschuesse: ["Arbeit und Soziales"] } },
    { key: "unvollstaendig", profile: { id: "m10", partei: "SPD" } },
    { key: "neue-partei", profile: { id: "m11", partei: "Neue Zukunftspartei", fraktion: "Neue Zukunftspartei", mandatsebene: "Bundestag", bundesland: "Sachsen", ausschuesse: ["Gesundheit"] } },
    { key: "neue-region", profile: { id: "m12", partei: "SPD", mandatsebene: "Landtag", bundesland: "Mecklenburg-Vorpommern", ausschuesse: ["Arbeit und Soziales"] } },
    { key: "private-tenant", profile: { id: "m13", partei: "SPD", fraktion: "SPD", mandatsebene: "Bundestag", bundesland: "Berlin", ausschuesse: ["Gesundheit"] } },
    { key: "google-news-abhaengig", profile: { id: "m14", partei: "AfD", fraktion: "AfD", mandatsebene: "Bundestag", bundesland: "Sachsen" } }
  ];
}

module.exports = { buildFixtureCatalog, buildHealthTelemetry, buildFixtureContext, representativeMandates };
