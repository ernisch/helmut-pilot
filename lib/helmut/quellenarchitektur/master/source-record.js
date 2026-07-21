"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Quellenrecord (Phase 4) + DSGVO-Guard (Phase 8).
//
// Reine Logik. Baut/validiert den kanonischen Quellenrecord mit den 20 Pflichtattributen und
// erzwingt Datenminimierung: der Record darf AUSSCHLIESSLICH oeffentliche, quellenbezogene
// Metadaten enthalten — KEINE privaten Kontaktdaten, KEINE personenbezogenen Rohinhalte.
//
// Herkunft + Prüfstatus sind PFLICHT (Abnahmekriterium §4): jede Quelle besitzt discovery_origin,
// discovered_at und review_status. Fehlt die Herkunft oder die Lizenzpruefung, ist der Record
// unvollstaendig (Tests §12/§13) und darf die Importstrecke nicht bis 'active' durchlaufen.

const model = require("./model");
const taxonomy = require("./taxonomy");
const base = require("../model");

// Felder, die per Konstruktion NIE im Katalog stehen duerfen (Datenminimierung, Phase 8 §2/§5).
// Der Katalog beschreibt QUELLEN (oeffentliche Organisationen/Feeds), keine Privatpersonen.
const FORBIDDEN_PII_KEYS = Object.freeze([
  "private_email", "private_phone", "private_address", "home_address",
  "mobile", "personal_email", "birthday", "geburtsdatum", "privatadresse",
  "handynummer", "private_social", "dob"
]);

// Heuristische Muster fuer versehentlich eingeschleuste private Kontaktdaten.
// Bewusst konservativ: amtliche Sammel-/Rollenadressen (presse@, poststelle@ …) sind erlaubt.
const PRIVATE_EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/ig; // global: ALLE Treffer pruefen
const ALLOWED_ROLE_MAILBOXES = /^(presse|press|pressestelle|info|kontakt|redaktion|kommunikation|office|media|newsroom|poststelle|buergerservice|zentrale|verwaltung|sekretariat|service|registratur|kanzlei)@/i;
const PHONE_RE = /(\+?\d[\d\s/().-]{7,}\d)/;

// Freitextfelder, die zusaetzlich auf Telefonnummern geprueft werden (Datums-/URL-/ID-Felder
// wuerden sonst falsch als Telefonnummer matchen). E-Mails werden feldunabhaengig geprueft.
const FREETEXT_FIELDS = Object.freeze(["responsible", "note"]);

function nowIsoDate(clock) {
  // Deterministisch testbar: die Zeit wird injiziert, nie aus Date.now() im Modul gezogen.
  return typeof clock === "string" ? clock : (clock && typeof clock.toISOString === "function" ? clock.toISOString() : null);
}

// Baut einen normalisierten Quellenrecord aus rohen Eingaben. Setzt Defaults konservativ:
//   - review_status startet auf 'discovered' (keine Quelle beginnt aktiv).
//   - license/privacy starten 'unbewertet' (Freigabe erfordert echte Pruefung).
function buildSourceRecord(input = {}, opts = {}) {
  const method = String(input.method || (input.retrieval && input.retrieval.method) || "").toLowerCase();
  const rawUrl = input.canonical_url || input.url || (input.retrieval && input.retrieval.url) || "";
  const domain = input.domain || base.canonicalDomain(rawUrl);
  const publisher_id = input.publisher_id || model.publisherIdForDomain(domain);
  const canonical_url = input.canonical_url || model.canonicalUrl(rawUrl);

  const retrieval = {
    method: method || "html",
    url: input.retrieval && input.retrieval.url != null ? input.retrieval.url : (rawUrl || null),
    query: input.retrieval && input.retrieval.query != null ? input.retrieval.query : (input.query || null),
    parser: input.retrieval && input.retrieval.parser != null ? input.retrieval.parser : (input.parser || null),
    expected_frequency: (input.retrieval && input.retrieval.expected_frequency) || input.expected_frequency || null
  };

  const source_type = String(input.source_type || "");
  const typeMeta = taxonomy.getSourceType(source_type);

  const record = {
    id: input.id || null,
    canonical_key: input.canonical_key || model.canonicalSourceKey({ publisher_id, method, canonical_url, query: retrieval.query }),
    // 1..2
    publisher_id,
    canonical_url,
    // 3
    retrieval,
    // 4
    source_type,
    // 5..10 (inhaltliche Klassifikation, Belang 3)
    political_level: input.political_level || null,
    institution_id: input.institution_id || null,
    party_id: input.party_id || null,
    group_id: input.group_id || null,
    committee_ids: uniqArr(input.committee_ids),
    topics: uniqArr(input.topics),
    region_ids: uniqArr(input.region_ids),
    // 11
    language: input.language || "de",
    // 12..14 (Herkunft/Audit, Belang 8)
    discovery_origin: input.discovery_origin || null,
    discovered_at: input.discovered_at || null,
    last_checked_at: input.last_checked_at || null,
    // 15..17 (Bewertung)
    trust: input.trust || (typeMeta ? typeMeta.default_trust : "unbekannt"),
    license_status: input.license_status || "unbewertet",
    privacy_status: input.privacy_status || "unbewertet",
    // 18..19 (Prüf-/Freigabestatus)
    review_status: model.isIntakeState(input.review_status) ? input.review_status : "discovered",
    release_status: input.release_status || "unfreigegeben",
    // 20 (Verantwortung: Regel-ID ODER Rolle — NIE eine Privatperson)
    responsible: input.responsible || null,
    // Beleg der Entdeckung (Nachvollziehbarkeit, Phase 6: keine erfundenen URLs)
    evidence_url: input.evidence_url || null,
    // inhaltliche Haltung (Fakt/Position/…): default aus Taxonomie, pro Quelle ueberschreibbar
    content_stance: input.content_stance || (typeMeta ? typeMeta.content_stance : null)
  };

  if (opts.clock && !record.discovered_at) record.discovered_at = nowIsoDate(opts.clock);
  if (!record.id) record.id = deriveId(record);
  return record;
}

function deriveId(record) {
  // Stabile, kollisionsarme ID aus dem kanonischen Schluessel (idempotent ueber Re-Importe).
  const h = require("crypto").createHash("sha1").update(String(record.canonical_key || "")).digest("hex").slice(0, 12);
  return `src-${h}`;
}

function uniqArr(v) {
  if (!Array.isArray(v)) return v == null || v === "" ? [] : [v];
  return [...new Set(v.filter((x) => x != null && String(x).trim() !== ""))];
}

// --- Validierung: sind alle Pflichtattribute + Herkunft + Prüfstatus vorhanden? -------------
// Rueckgabe: { ok, errors, warnings, missingAttributes }.
function validateSourceRecord(record = {}) {
  const errors = [];
  const warnings = [];
  const missingAttributes = [];

  for (const attr of model.SOURCE_ATTRIBUTES) {
    const v = record[attr];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0 && REQUIRED_NONEMPTY.has(attr));
    if (empty && REQUIRED_ATTRS.has(attr)) missingAttributes.push(attr);
  }

  if (!record.publisher_id) errors.push("publisher_id fehlt");
  if (!record.canonical_url && !(record.retrieval && (record.retrieval.query || record.retrieval.url))) {
    errors.push("weder canonical_url noch Abrufweg vorhanden");
  }
  if (!taxonomy.isKnownSourceType(record.source_type)) errors.push(`unbekannter source_type: ${record.source_type || "(leer)"}`);
  // Herkunft ist PFLICHT (Abnahme §4, Test §12).
  if (!record.discovery_origin || !model.DISCOVERY_ORIGINS.includes(record.discovery_origin)) {
    errors.push("Herkunft (discovery_origin) fehlt oder unbekannt");
  }
  if (!record.discovered_at) errors.push("discovered_at (Datum der Entdeckung) fehlt");
  // Prüfstatus ist PFLICHT (Abnahme §4).
  if (!model.isIntakeState(record.review_status)) errors.push("review_status ist kein gueltiger Importzustand");
  if (!model.TRUST_LEVELS.includes(record.trust)) errors.push(`ungueltiger trust: ${record.trust}`);
  if (!model.LICENSE_STATES.includes(record.license_status)) errors.push(`ungueltiger license_status: ${record.license_status}`);
  if (!model.PRIVACY_STATES.includes(record.privacy_status)) errors.push(`ungueltiger privacy_status: ${record.privacy_status}`);
  if (!model.RELEASE_STATES.includes(record.release_status)) errors.push(`ungueltiger release_status: ${record.release_status}`);

  // Belegpflicht: manuell kuratierte oder such-entdeckte Quellen brauchen einen Herkunftsbeleg
  // (Phase 6: keine scheinbar plausiblen Daten ohne Herkunft).
  if ((record.discovery_origin === "manual_curation" || record.discovery_origin === "search_discovery") && !record.evidence_url) {
    warnings.push("Herkunftsbeleg (evidence_url) fehlt fuer manuelle/such-entdeckte Quelle");
  }

  const pii = scanForPrivatePii(record);
  for (const p of pii) errors.push(p);

  return { ok: errors.length === 0, errors, warnings, missingAttributes };
}

// Pflichtattribute fuer einen vollstaendigen Record (Herkunft/Prüfstatus zwingend).
const REQUIRED_ATTRS = new Set([
  "publisher_id", "source_type", "political_level", "language",
  "discovery_origin", "discovered_at", "trust", "license_status",
  "privacy_status", "review_status", "release_status"
]);
const REQUIRED_NONEMPTY = new Set(); // Array-Felder duerfen leer sein (z. B. committee_ids)

// --- DSGVO: private Kontaktdaten aufspueren (Phase 8, Test §21) ------------------------------
// Wirft NICHT, sondern liefert klassifizierte Fehlermeldungen; der Aufrufer entscheidet.
function scanForPrivatePii(record = {}) {
  const found = [];
  for (const key of FORBIDDEN_PII_KEYS) {
    if (record[key] != null && String(record[key]).trim() !== "") {
      found.push(`verbotenes personenbezogenes Feld: ${key}`);
    }
  }
  // E-Mails feldunabhaengig ueber ALLE String-Werte pruefen (Emails sind distinktiv -> keine
  // Datum/URL-Fehltreffer). ALLE Treffer je Feld pruefen, nicht nur den ersten (Review-Fund).
  for (const [k, v] of Object.entries(record)) {
    if (typeof v !== "string" || !v) continue;
    const mails = v.match(PRIVATE_EMAIL_RE) || [];
    if (mails.some((m) => !ALLOWED_ROLE_MAILBOXES.test(m))) {
      found.push(`moegliche private E-Mail in ${k}`);
    }
  }
  // Telefonnummern nur in Freitextfeldern (Datums-/URL-/ID-Felder wuerden sonst falsch matchen).
  for (const field of FREETEXT_FIELDS) {
    const val = String(record[field] == null ? "" : record[field]);
    if (val && PHONE_RE.test(val)) found.push(`moegliche Telefonnummer in ${field}`);
  }
  return found;
}

// Darf dieser Record 'active' werden? Nur mit vollstaendiger Prüfung + Freigabe (Test §16).
function isEligibleForActivation(record = {}) {
  const v = validateSourceRecord(record);
  if (!v.ok) return { ok: false, reason: "record-unvollstaendig", detail: v.errors };
  if (record.license_status === "unbewertet" || record.license_status === "unklar" || record.license_status === "untersagt") {
    return { ok: false, reason: `lizenz-${record.license_status}` };
  }
  if (record.privacy_status === "unbewertet" || record.privacy_status === "pruefung_noetig" || record.privacy_status === "unzulaessig") {
    return { ok: false, reason: `datenschutz-${record.privacy_status}` };
  }
  if (record.release_status === "unfreigegeben" || record.release_status === "zurueckgezogen") {
    return { ok: false, reason: `freigabe-${record.release_status}` };
  }
  return { ok: true, reason: "aktivierbar" };
}

module.exports = {
  FORBIDDEN_PII_KEYS, REQUIRED_ATTRS,
  buildSourceRecord, deriveId, validateSourceRecord, scanForPrivatePii, isEligibleForActivation
};
