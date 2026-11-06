"use strict";

// Zwei technisch geprüfte Metadatenwege. Die Vorbereitung aktiviert keinen Abruf;
// insbesondere ist Bundespuls keine zweite unabhängige Bestätigung der DIP-Daten.
const BUNDESPULS_SOURCE_ID = "bundespuls-vorgaenge-rss";
const PARLAMENTSDATEN_QUELLEN = [
  {
    id: "eurlex-amtsblatt-l-rss", name: "EUR-Lex — Amtsblatt L (Rechtsakte)",
    url: "https://eur-lex.europa.eu/DE/display-feed.rss?rssId=222", crawlMethod: "rss",
    type: "official", evidenceRole: "official_primary", priority: 80,
    active: false, preparedOnly: true, packageKeys: ["fach-europaeische-union"],
    coverageClasses: ["eu_rechtsakte"], rightsReviewRequired: false,
    usagePolicy: {
      status: "metadata_only", scope: "metadata_only", commercialUseApproved: true,
      fullTextAllowed: false, metadataLicense: "CC0-1.0",
      attribution: "EUR-Lex — Amt für Veröffentlichungen der Europäischen Union",
      note: "Dieser Weg erfasst Titel, CELEX-Link und Feed-Publikationsdatum. Metadaten sind CC0; die gesonderten Rechte an Dokumenten, redaktionellen Inhalten und Konsolidierungen erweitern diesen Abrufumfang nicht.",
      evidenceUrls: ["https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=en"]
    },
    verification: {
      status: "technically_verified_metadata_only", checkedAt: "2026-11-06T13:30:41.852Z",
      discoveredOn: "https://eur-lex.europa.eu/content/help/search/predefined-rss.html",
      httpStatus: 200, feedParsed: true, itemCount: 100, parsedSampleCount: 5,
      latestPublishedAt: "2026-11-05T23:00:00.000Z",
      sampleArticleUrl: "https://eur-lex.europa.eu/legal-content/AUTO/?uri=CELEX:32026R2409",
      bodySha256: "ff58e8db4d6ad49e3a53635dedc566c33458f1ba289428fb6ba2cd8c9382ea4b",
      dateSemantics: "Feed-Publikation; kein Nachweis des Beschlusses oder Inkrafttretens.",
      publicationCadence: "unknown"
    }
  },
  {
    id: BUNDESPULS_SOURCE_ID, name: "Bundespuls — parlamentarische Vorgänge (DIP-Aufbereitung)",
    url: "https://bundespuls.de/feed/vorgang", crawlMethod: "rss",
    type: "aggregator", category: "unbekannt", trust: "unbekannt", evidenceRole: "aggregator", priority: 60,
    active: false, preparedOnly: true, packageKeys: ["bund-basis"],
    coverageClasses: ["parlamentsvorgaenge_aggregiert"], rightsReviewRequired: true,
    usagePolicy: {
      status: "metadata_only_review_required", scope: "metadata_only", commercialUseApproved: false,
      fullTextAllowed: false,
      attribution: "Quelle: Deutscher Bundestag/Bundesrat – DIP. Aufbereitung: Bundespuls, bundespuls.de",
      upstreamSource: "DIP", upstreamUrl: "https://dip.bundestag.de/", independentEvidence: false,
      note: "Dieser Einstiegsweg speichert nur Titel und Originaladressen, keine Feedbeschreibungen. Kostenloser Automationszugang laut Anbieter; Dokumentnummern soweit vorhanden und veränderte Auszüge kennzeichnen. Redaktionelle Bundespuls-Texte stehen unter CC BY 4.0; TDM-Vorbehalt und Ausnahmen vor Aktivierung beachten. Keine Volltextübernahme über diesen Feedweg.",
      providerMethodology: "Laut Anbieter keine KI-Zusammenfassungen; Feed-Vorspänne sind regelbasierte Metadaten. Dies ist keine allgemeine KI-Nutzungslizenz oder ein KI-Nutzungsverbot.",
      activationRequirements: ["Quellenangabe sicherstellen", "Kontakt im User-Agent setzen", "Anbieter-Cachehinweise berücksichtigen"],
      evidenceUrls: ["https://bundespuls.de/entwickler", "https://bundespuls.de/methodik", "https://bundespuls.de/impressum", "https://dip.bundestag.de/documents/nutzungsbedingungen_dip.pdf"]
    },
    verification: {
      status: "technically_verified_rights_pending", checkedAt: "2026-11-06T13:30:43.511Z",
      discoveredOn: "https://bundespuls.de/entwickler", httpStatus: 200,
      feedParsed: true, itemCount: 50, parsedSampleCount: 5, latestPublishedAt: null,
      latestUpdatedAt: "2026-11-06T13:20:27.000Z",
      sampleArticleUrl: "https://bundespuls.de/vorgang/341273",
      bodySha256: "fe52ef9f4c9de7a9858ce19dcae1d6d8843c95d9f8c0092972be6d116a406e19",
      dateSemantics: "RSS pubDate entspricht DIP.aktualisiert, nicht der erstmaligen Veröffentlichung; publishedAt bleibt null.",
      upstreamDateEvidenceUrl: "https://dip.bundestag.de/vorgang/341273",
      publicationCadence: "unknown", observedCacheMaxAgeSeconds: 900
    }
  }
];

// Nur die zwei konkreten Feedidentitäten. Gleichnamige Quellen, fremde URLs und
// abweichende zusätzliche Feeds bekommen keine quellspezifische Sonderbehandlung.
function parlamentsdatenFeed(source = {}) {
  const known = PARLAMENTSDATEN_QUELLEN.find((s) => s.id === source.id);
  const urls = [source.url, source.rssUrl, ...(source.rssUrls || [])].filter(Boolean);
  return known && urls.length && urls.every((url) => url === known.url) ? known : null;
}

module.exports = { PARLAMENTSDATEN_QUELLEN, BUNDESPULS_SOURCE_ID, parlamentsdatenFeed };
