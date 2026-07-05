"use strict";

// Helmut Core V3 — C6: Kanonische URL-Normalisierung + Cross-Source-Dedup.
// Deterministisch, KEINE KI. Reine, testbare Funktionen ohne Storage-/Netz-Abhaengigkeit.
//
// DSGVO by design (Datenminimierung):
//   - raw_documents ist eine PUBLIC-Registry (kein user_id, keine Nutzerdaten).
//   - toRawDocumentRow() speichert NUR nicht-personenbezogene Dedup-Metadaten +
//     oeffentliche Schlagzeile + gekuerzten Kontext. Bewusst NICHT: Volltext/content,
//     excerpt, imageUrl, author-PII, kompletter Rohpayload.
//   - Es werden KEINE privaten Personenprofile aus Artikeln abgeleitet — nur die
//     Identitaet des oeffentlichen Dokuments (URL/Titel/Datum) fuer die Deduplizierung.

const crypto = require("crypto");

// Maximale Laenge des gespeicherten Kontext-Snippets (Datenminimierung: kein Volltext).
const SUMMARY_MAX = Number(process.env.HELMUT_RAWDOC_SUMMARY_MAX || 240);
// SICHERHEIT: Titel deckelt (anders als summary bisher unbegrenzter Postgres-text).
// Echte Schlagzeilen sind immer viel kuerzer; die Grenze faengt nur eine boesartige/
// kompromittierte Quelle ab, die einen ueberlangen, prompt-dominierenden "Titel" sendet
// (der Titel fliesst ungekuerzt in die Understanding-/Briefing-Prompts ein).
const TITLE_MAX = 300;

// Tracking-/Kampagnen-Parameter, die keine Dokument-Identitaet tragen.
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "fbclid", "gclid", "gclsrc", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid",
  "ref", "ref_src", "cmp", "icid", "ncid", "spm", "wt_mc", "at_medium", "at_campaign",
  "gaa_at", "gaa_n", "gaa_ts", "gaa_sig", "s_cid", "vgo_ee", "_hsenc", "_hsmi"
]);

// Kanonische URL: Schema/Host klein, www. weg, Fragment weg, Tracking-Parameter weg,
// verbleibende Query-Parameter deterministisch sortiert, Trailing-Slash entfernt.
// Nicht-http(s) oder ungueltig -> "".
function canonicalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const u = new URL(raw);
    u.hash = "";
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    const keep = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.push([k, v]);
    }
    keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    u.search = "";
    keep.forEach(([k, v]) => u.searchParams.append(k, v));
    let out = u.toString();
    out = out.replace(/\/(\?|$)/, "$1"); // Trailing-Slash am Pfadende entfernen
    return out;
  } catch {
    return "";
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function normalizeTitleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Dedup-Identitaet: bevorzugt die kanonische URL; sonst (viele Nicht-Direktlinks
// haben leere URL) Fallback auf normalisierten Titel + Publikationstag.
function contentHash(item = {}) {
  const canonical = canonicalizeUrl(item.url || item.canonical_url);
  if (canonical) return sha256(`url:${canonical}`);
  const day = String(item.publishedAt || item.published_at || "").slice(0, 10);
  const titleKey = normalizeTitleKey(item.title);
  if (!titleKey && !day) return "";
  return sha256(`t:${titleKey}|d:${day}`);
}

function truncate(value, max) {
  const v = String(value || "");
  return v.length > max ? v.slice(0, max) : v;
}

// Abbildung eines rawItem auf eine MINIMIERTE raw_documents-Zeile (DSGVO by design).
// Speichert bewusst KEINEN Volltext/excerpt/imageUrl/author und keinen Rohpayload.
function toRawDocumentRow(item = {}) {
  const hash = contentHash(item);
  if (!hash) return null;
  const canonical = canonicalizeUrl(item.url || item.canonical_url);
  return {
    id: `rd-${hash}`,
    canonical_url: canonical || null,
    content_hash: hash,
    cluster_id: null,                                  // Vorgangs-Clustering erst in C7
    title: item.title ? truncate(item.title, TITLE_MAX) : null, // oeffentliche Schlagzeile (gedeckelt)
    summary: item.summary ? truncate(item.summary, SUMMARY_MAX) : null, // gekuerzter Kontext, kein Volltext
    url: item.url || null,                             // oeffentlicher Artikellink
    source_name: item.sourceName || item.source_name || null,
    source_id: item.sourceId || item.source_id || null,
    source_type: item.sourceType || item.source_type || null,
    confidence: item.confidence || null,
    link_type: item.linkType || item.link_type || null,
    published_at: item.publishedAt || item.published_at || null,
    retrieved_at: item.retrievedAt || item.retrieved_at || null,
    document_type: item.documentType || item.document_type || null,
    wahlperiode: item.wahlperiode || null,
    // Nur nicht-personenbezogene Dedup-Metadaten. KEIN content/excerpt/imageUrl/author.
    raw: {
      sourcePriority: item.sourcePriority || item.priority || null,
      originalUrl: item.originalUrl || null
    }
  };
}

// Cross-Source-Dedup: gleiche Story aus mehreren Quellen -> eine Zeile.
// Behaelt die Zeile mit dem belastbarsten Link/Vertrauen.
function rowRank(row = {}) {
  let score = 0;
  if (row.link_type === "direct") score += 20;
  if (row.confidence === "high") score += 10;
  if (row.canonical_url) score += 5;
  return score;
}

function dedupeRawDocuments(rows = []) {
  const byHash = new Map();
  for (const row of rows) {
    if (!row || !row.content_hash) continue;
    const existing = byHash.get(row.content_hash);
    if (!existing || rowRank(row) > rowRank(existing)) byHash.set(row.content_hash, row);
  }
  return [...byHash.values()];
}

module.exports = {
  canonicalizeUrl,
  contentHash,
  toRawDocumentRow,
  dedupeRawDocuments,
  SUMMARY_MAX
};
