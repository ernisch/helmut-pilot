"use strict";

// Helmut — Universelle Quellenbibliothek (Sprint 2) · Typen & Schnittstellen.
//
// Reine JSDoc-Typdefinitionen (KEIN Laufzeitcode). Sie sind der VERBINDLICHE
// Vertrag der Quellenbibliothek: jede Quelle wird als `SourceDescriptor` strukturiert
// beschrieben — keine fest codierten Sonderfälle, keine impliziten Feld-Konventionen.
//
// Abgrenzung zur bestehenden `quellenarchitektur/` (Sprint-1..10-Migration):
//   - `quellenarchitektur/model.js`   = relationales Speichermodell (publishers/
//     retrieval_paths/source_packages/package_paths) + Status-/Refcount-Logik.
//   - `quellenbibliothek/`            = das UNIVERSELLE Beschreibungs- und
//     Zuweisungsmodell darüber: EIN flacher, selbstbeschreibender Deskriptor je
//     Quelle, aus dem Zuweisung, Qualität, Health und Discovery rein datengetrieben
//     abgeleitet werden. Die Bibliothek ist die "Quellenfabrik", das relationale
//     Modell bleibt die Persistenzform.
//
// Die Bibliothek erzeugt NICHTS am Live-Verhalten: sie ist additiv, ohne Netz,
// ohne KI, ohne Storage-Write.

/**
 * @typedef {"international"|"eu"|"bund"|"land"|"bezirk"|"kreis"|"kommune"} Level
 *   Politische/geografische Ebene. `region`/`wahlkreis` ist KEINE Ebene, sondern
 *   eine Geografie-/Zuständigkeitsangabe (siehe `regions`).
 */

/**
 * @typedef {"rss"|"api"|"html"|"search"|"structured_download"} RetrievalMethod
 *   Technischer Abrufweg. `search` verallgemeinert die frühere `googlenews_search`
 *   auf jeden Aggregator-Suchweg (Provider steckt in `access.provider`).
 */

/**
 * @typedef {"official_primary"|"direct_interest"|"journalistic"|"data_source"|"aggregator"} EvidenceRole
 *   Belegfunktion des Herausgebers (WIE stark belegt seine Aussage einen Sachverhalt).
 */

/**
 * @typedef {"hoch"|"mittel"|"niedrig"|"blockiert"|"unbekannt"} TrustLevel
 */

/**
 * @typedef {"active"|"prepared"|"paused"|"archived"} UsageStatus
 *   Nutzungsstatus/Lebenszyklus der Quelle in der Bibliothek.
 */

/**
 * @typedef {"open"|"attribution"|"restricted"|"prohibited"|"unknown"} LicenseStatus
 *   Lizenz-/Rechtslage der Nutzung. `prohibited` = darf NICHT abgerufen werden
 *   (z. B. bot-gesperrt/AGB-Verbot) und wird von der Zuweisung hart ausgeschlossen.
 */

/**
 * Wie der Inhalt technisch erreicht wird.
 * @typedef {Object} SourceAccess
 * @property {RetrievalMethod} method
 * @property {string} [url]        Feed-/Endpoint-/Seiten-URL.
 * @property {string} [query]      Suchdefinition bei method==="search".
 * @property {string} [provider]   Aggregator/Anbieter (z. B. "google_news", "dip").
 * @property {string} [parser]     Registrierter Parser-Schlüssel (siehe parser-Registry).
 * @property {number} [maxItems]
 */

/**
 * Strukturierte, selbstbeschreibende Beschreibung EINER Quelle — der Kern der
 * universellen Bibliothek. Alle Zuweisungs-/Qualitäts-/Health-Entscheidungen
 * lesen NUR diese Felder; es gibt keine ausgelagerten Sonderfall-Tabellen.
 *
 * @typedef {Object} SourceDescriptor
 * @property {string} id                 Stabiler, kanonischer Schlüssel (dedupfähig).
 * @property {string} publisher          Herausgeber (Organisation), die veröffentlicht.
 * @property {string} name               Menschliche Quellenbezeichnung.
 * @property {EvidenceRole} evidenceRole Belegfunktion des Herausgebers.
 * @property {SourceAccess} access       Abrufweg (RSS/HTML/API/Suche/Download).
 * @property {Level} [level]             Politische Ebene der Zuständigkeit.
 * @property {string} [geographyId]      Geografie-Anker (geo-*), optional.
 * @property {string[]} parties          Betroffene Parteien (normalisierte Keys).
 * @property {string[]} factions         Betroffene Fraktionen (normalisierte Keys).
 * @property {string[]} committees       Betroffene Ausschüsse (normalisierte Keys).
 * @property {string[]} topics           Themen/Politikfelder (normalisierte Keys).
 * @property {string[]} regions          Regionen/Wahlkreise/Bundesländer (Keys).
 * @property {string[]} ministries       Zuständige Ministerien/Behörden (Keys).
 * @property {boolean} universal         true = neutrale Grundversorgung für JEDES Mandat.
 * @property {number} priority           0..100, Basis-Priorität (Redaktions-Hinweis).
 * @property {TrustLevel} trust          Vertrauensniveau.
 * @property {string} [expectedFrequency] Erwartete Aktualität ("daily"/"weekly"/...).
 * @property {UsageStatus} status        Nutzungsstatus.
 * @property {LicenseStatus} license     Lizenz-/Nutzungsstatus.
 * @property {HealthRecord} [health]     Aktueller Health-Zustand (vom Gesundheitsmotor).
 * @property {Object} [meta]             Freie, nicht-semantische Zusatzdaten.
 */

/**
 * Aus dem Mandatsregister abgeleitetes Anforderungsprofil — WAS ein Mandat braucht.
 * Rein aus Mandatsdaten gebildet, kennt KEINE Quelle und KEIN Paket.
 *
 * @typedef {Object} MandateRequirement
 * @property {string} mandateId
 * @property {Level} level               Ebene des Mandats (bund/land/...).
 * @property {string[]} parties
 * @property {string[]} factions
 * @property {string[]} committees
 * @property {string[]} topics
 * @property {string[]} regions
 * @property {string[]} ministries
 * @property {string[]} geographyIds     Zuständige Geografien (Land/Wahlkreis-Anker).
 * @property {boolean} usable            Ist das Mandat aktivierungsfähig?
 */

/**
 * Nachvollziehbares, mehrachsiges Qualitätsurteil je Quelle.
 * @typedef {Object} QualityScore
 * @property {string} sourceId
 * @property {number} score              0..1 Gesamtscore (gewichtetes Mittel).
 * @property {Object.<string,number>} axes Achse -> Teilscore 0..1.
 * @property {Object.<string,number>} weights Achse -> verwendetes Gewicht.
 * @property {string[]} explanation      Menschliche Begründung je Achse.
 * @property {Object.<string,boolean>} available Achse -> lag echte Datengrundlage vor?
 */

/**
 * Health-Zustand einer Quelle (Ergebnis des Gesundheitsmotors).
 * @typedef {Object} HealthRecord
 * @property {"reachable"|"slow"|"broken"|"parser_error"|"rate_limited"|"http_error"|"never_checked"|"disabled"} state
 * @property {number} errorStreak        Länge der aktuellen Fehlerserie.
 * @property {?number} lastSuccessAt     ms-Zeitstempel des letzten Erfolgs (null = nie).
 * @property {?number} lastCheckedAt     ms-Zeitstempel der letzten Prüfung (null = nie).
 * @property {?number} lastLatencyMs
 * @property {?string} lastError
 * @property {boolean} needsAttention    Erfordert Admin-Aufmerksamkeit?
 */

/**
 * Beobachtung eines Abrufversuchs — Eingabe des Gesundheitsmotors.
 * @typedef {Object} HealthObservation
 * @property {boolean} [ok]              Erfolgreich abgerufen + geparst?
 * @property {?number} [httpStatus]
 * @property {?number} [latencyMs]
 * @property {boolean} [parserOk]
 * @property {boolean} [rateLimited]
 * @property {boolean} [disabled]        Quelle administrativ deaktiviert.
 * @property {number} [items]            Zahl gelieferter Items.
 * @property {?number} [at]              ms-Zeitstempel der Beobachtung.
 * @property {?string} [error]
 */

/**
 * Discovery-Kandidat: eine (noch nicht aufgenommene) mögliche neue Quelle.
 * @typedef {Object} DiscoveryCandidate
 * @property {string} publisher
 * @property {string} url
 * @property {RetrievalMethod} [method]
 * @property {string[]} [topics]
 * @property {string[]} [regions]
 * @property {EvidenceRole} [evidenceRole]
 * @property {string} [discoveredVia]    Fundweg ("sitemap"/"outlink"/"registry"/...).
 */

module.exports = {}; // reine Typdatei — kein Laufzeit-Export.
