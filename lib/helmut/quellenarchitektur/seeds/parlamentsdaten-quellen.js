"use strict";

// Technisch geprüfte Metadatenwege. Die Vorbereitung aktiviert keinen Abruf;
// insbesondere ist Bundespuls keine zweite unabhängige Bestätigung der DIP-Daten.
const BUNDESPULS_SOURCE_ID = "bundespuls-vorgaenge-rss";
const BMG_SOURCE_ID = "bmg-meldungen-rss";
const PARLAMENTSDATEN_QUELLEN = [
  {
    id: "eurlex-amtsblatt-l-rss", name: "EUR-Lex — Amtsblatt L (Rechtsakte)",
    url: "https://eur-lex.europa.eu/DE/display-feed.rss?rssId=222", crawlMethod: "rss",
    type: "official", evidenceRole: "official_primary", priority: 80,
    active: false, preparedOnly: true, packageKeys: ["fach-europaeische-union"],
    coverageClasses: ["eu_rechtsakte"], rightsReviewRequired: false,
    usagePolicy: {
      status: "metadata_and_verified_legal_excerpt", scope: "metadata_and_verified_legal_excerpt", commercialUseApproved: true,
      legalExcerptAllowed: true, maxExcerptCharacters: 240,
      legalDocumentReuseLicense: "EUR-Lex-legal-documents-reuse",
      imagesAllowed: false, aiTrainingAllowed: false,
      fullTextAllowed: false, metadataLicense: "CC0-1.0",
      attribution: "EUR-Lex — Amt für Veröffentlichungen der Europäischen Union",
      note: "Metadaten sind CC0. Zusaetzlich nur ein exakt gebundener, vollstaendiger kurzer operativer Absatz aus einem amtlichen deutschen COM-Originalrechtsakt: EUR-Lex-Reusehinweis fuer Rechtsdokumente, mit Original-/Versions-/Publikations-/Urhebernachweis und ohne Sonderrechte, Bilder, Anhaenge oder Volltextuebernahme. Ungepruefte Artikel bleiben Titel/Link. CC0 gilt nicht fuer den Rechtstext.",
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
    coverageClasses: ["parlamentsvorgaenge_aggregiert"], rightsReviewRequired: false,
    usagePolicy: {
      status: "metadata_only", scope: "metadata_only", commercialUseApproved: true,
      fullTextAllowed: false,
      attribution: "Quelle: Deutscher Bundestag/Bundesrat – DIP. Aufbereitung: Bundespuls, bundespuls.de",
      upstreamSource: "DIP", upstreamUrl: "https://dip.bundestag.de/", independentEvidence: false,
      note: "Nur Titel und Links, keine Feedbeschreibungen oder Volltexte. DIP-Nutzungsbedingungen Ziff. 4 erlauben kommerzielle Datenweiterverarbeitung mit Quellenangabe, Kennzeichnung von Veränderungen und verlinktem Hinweis auf die kostenlosen DIP-Originaldaten. Dokumentart und -nummer sind beim Zitieren amtlicher Werke zusätzlich anzugeben; eine Vorgangs-ID ist keine Drucksachennummer. Bundespuls erlaubt den kostenlosen Automationszugang. Diese Freigabe umfasst kein KI-Training und keine weitergehende Inhaltsübernahme.",
      providerMethodology: "Laut Anbieter keine KI-Zusammenfassungen; Feed-Vorspänne sind regelbasierte Metadaten. Dies ist keine allgemeine KI-Nutzungslizenz oder ein KI-Nutzungsverbot.",
      attributionRequired: true, freeOriginalNoticeRequired: true,
      contactUrl: "https://helmut-pilot.vercel.app/impressum", recommendedCacheSeconds: 900,
      usageConditionsCheckedAt: "2026-11-06T15:46:00Z",
      evidenceUrls: ["https://bundespuls.de/entwickler", "https://bundespuls.de/methodik", "https://bundespuls.de/impressum", "https://dip.bundestag.de/documents/nutzungsbedingungen_dip.pdf"]
    },
    verification: {
      status: "technically_verified_metadata_only", checkedAt: "2026-11-06T13:30:43.511Z",
      discoveredOn: "https://bundespuls.de/entwickler", httpStatus: 200,
      feedParsed: true, itemCount: 50, parsedSampleCount: 5, latestPublishedAt: null,
      latestUpdatedAt: "2026-11-06T13:20:27.000Z",
      sampleArticleUrl: "https://bundespuls.de/vorgang/341273",
      bodySha256: "fe52ef9f4c9de7a9858ce19dcae1d6d8843c95d9f8c0092972be6d116a406e19",
      dateSemantics: "RSS pubDate entspricht DIP.aktualisiert, nicht der erstmaligen Veröffentlichung; publishedAt bleibt null.",
      upstreamDateEvidenceUrl: "https://dip.bundestag.de/vorgang/341273",
      publicationCadence: "unknown", observedCacheMaxAgeSeconds: 900
    }
  },
  {
    id: BMG_SOURCE_ID, name: "Bundesministerium für Gesundheit — aktuelle Meldungen",
    url: "https://www.bundesgesundheitsministerium.de/meldungen.xml", crawlMethod: "rss",
    type: "official", evidenceRole: "official_primary", priority: 80, maxItems: 12,
    active: false, preparedOnly: true, packageKeys: ["arbeit-und-soziales", "fach-gesundheit"],
    coverageClasses: ["ministerium_meldungen"], rightsReviewRequired: false,
    usagePolicy: {
      status: "metadata_only", scope: "metadata_only", commercialUseApproved: true,
      fullTextAllowed: false, imagesAllowed: false, aiTrainingAllowed: false,
      attribution: "Bundesministerium für Gesundheit (BMG)", attributionRequired: true,
      note: "Ausschliesslich Titel, Original-Link, echtes Item-Publikationsdatum und Herausgeberhinweis. Keine Feedbeschreibungen, Artikeltexte, Bilder oder KI-Training. Der amtlich verlinkte RSS-Zugang und das Impressum sind keine allgemeine Textlizenz; abweichende oder ungepruefte Inhaltsrechte werden nicht freigegeben.",
      evidenceUrls: ["https://www.bundesgesundheitsministerium.de/service/rss-feed", "https://www.bundesgesundheitsministerium.de/impressum"]
    },
    verification: {
      status: "technically_verified_metadata_only", checkedAt: "2026-11-17",
      discoveredOn: "https://www.bundesgesundheitsministerium.de/service/rss-feed",
      httpStatus: 200, feedParsed: true, itemCount: 691, parsedSampleCount: 2,
      latestPublishedAt: "2026-11-15T23:00:00.000Z",
      sampleArticleUrl: "https://www.bundesgesundheitsministerium.de/dialogforum-kinder-und-jugendsport",
      bodySha256: "47c63f47dd3c079e4d9634e3a765c2b9fa2b7502c55b3792abcf5f9e2d3e7324",
      dateSemantics: "Nur Item-pubDate mit explizitem CET/CEST-Offset; Kanal-Builddatum und Abruf sind keine Publikation.",
      publicationCadence: "unknown"
    }
  }
];

// Nur die konkreten Feedidentitäten. Gleichnamige Quellen, fremde URLs und
// abweichende zusätzliche Feeds bekommen keine quellspezifische Sonderbehandlung.
function parlamentsdatenFeed(source = {}) {
  const known = PARLAMENTSDATEN_QUELLEN.find((s) => s.id === source.id);
  const urls = [source.url, source.rssUrl, ...(source.rssUrls || [])].filter(Boolean);
  return known && urls.length && urls.every((url) => url === known.url) ? known : null;
}

module.exports = { PARLAMENTSDATEN_QUELLEN, BUNDESPULS_SOURCE_ID, BMG_SOURCE_ID, parlamentsdatenFeed };
