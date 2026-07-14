"use strict";

// Helmut — Neue Quellenarchitektur · Globale Deduplizierung + Fundstellenmodell (Sprint 3).
//
// Reine, deterministische Logik (KEINE KI, kein Netz, kein Storage-Write). Loest zwei
// Auftrags-Kernregeln (§16/§17):
//   1. Ein Artikel, der ueber MEHRERE Suchwege (Abrufwege) gefunden wird, erzeugt nur EIN
//      Raw Document; die unterschiedlichen Suchwege bleiben als FUNDSTELLEN erhalten.
//   2. Deduplizierung nutzt mehrere Signale VOR der teuren KI: bereinigte URL, Canonical-URL,
//      Herausgeberdomain, Titelaehnlichkeit, Veroeffentlichungsdatum, Inhaltsfingerabdruck.
//
// Google News ist ein SUCHWEG, kein Herausgeber: die echte Herausgeberdomain (aus der
// aufgeloesten Original-URL) traegt die Identitaet; die Google-News-Fund-URL bleibt nur als
// Fundstelle erhalten.
//
// Additiv: dockt an die BESTEHENDE rawItem-Struktur (crawler.normalizeRawItem) an und ist
// NICHT in den Live-Crawl verdrahtet (Verhaltenswechsel = freigabepflichtig, spaeterer Schritt).

const crypto = require("crypto");
const { canonicalizeUrl } = require("../dedup");
const { canonicalDomain, contentFingerprint } = require("./model");

// Titel-Normalisierung (identisch zu dedup.js, dort nicht exportiert -> lokal gehalten,
// um dedup.js nicht zu veraendern).
function normalizeTitleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DEFAULT_DATE_WINDOW_DAYS = 2;
const DEFAULT_TITLE_SIM_THRESHOLD = 0.72;

// --- bereinigte URL / Canonical / Domain ------------------------------------
// Beste bekannte Original-URL eines rawItems (aufgeloest > original > proxy).
function bestUrl(item = {}) {
  return item.url || item.canonical_url || item.originalUrl || item.original_url || "";
}

function cleanedUrl(item = {}) {
  return canonicalizeUrl(bestUrl(item));
}

// Echte Herausgeberdomain (NICHT news.google.com — Aggregatoren zaehlen nicht als Herausgeber).
function publisherDomain(item = {}) {
  const d = canonicalDomain(bestUrl(item));
  if (!d || /(^|\.)news\.google\.com$/.test(d) || /(^|\.)google\.com$/.test(d)) return "";
  return d;
}

// --- Titelaehnlichkeit (Token-Jaccard ueber normalisierte Titel) ------------
function titleTokens(title) {
  return new Set(normalizeTitleKey(title).split(" ").filter((w) => w.length >= 3));
}

function titleSimilarity(a, b) {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

// --- Inhaltsfingerabdruck (getrennt vom URL/Titel-basierten content_hash) ---
// Delegiert an model.contentFingerprint (Titel + Kontext, tokensortiert). Bewusst NICHT
// derselbe Wert wie dedup.contentHash (das ist ein URL/Titel-Hash, kein Inhaltsfingerabdruck).
function fingerprint(item = {}) {
  return contentFingerprint({ title: item.title, summary: item.summary || item.excerpt || item.content });
}

// --- Fundstelle (eine Beobachtung derselben Story ueber einen Abrufweg) -----
function buildFinding(item = {}) {
  return {
    source_id: item.sourceId || item.source_id || null,
    retrieval_path_id: item.retrieval_path_id || (item.sourceId ? `rp-${item.sourceId}` : null),
    original_url: item.originalUrl || item.original_url || bestUrl(item) || null,
    link_type: item.linkType || item.link_type || null,
    found_at: item.retrievedAt || item.retrieved_at || null
  };
}

function dayOf(item = {}) {
  return String(item.publishedAt || item.published_at || "").slice(0, 10);
}

function daysBetween(d1, d2) {
  if (!d1 || !d2) return Infinity;
  const t1 = Date.parse(`${d1}T00:00:00Z`);
  const t2 = Date.parse(`${d2}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return Infinity;
  return Math.abs(t1 - t2) / 86400000;
}

// --- globale Zusammenfuehrung: mehrere Suchwege -> EIN Dokument + Fundstellen -
// Signalstufen (streng -> weich):
//   A) exakt gleiche Canonical-URL   -> sicher dieselbe Story
//   B) gleicher Inhaltsfingerabdruck -> sehr wahrscheinlich dieselbe Story
//   C) gleiche Herausgeberdomain + Titelaehnlichkeit>=Schwelle + Datum im Fenster
// A/B sind global (ueber Herausgeber hinweg), C ist auf denselben Herausgeber begrenzt
// (verhindert, dass unterschiedliche Landesvorgaenge nur wegen aehnlicher Begriffe
// zusammenfallen — Auftrag §18).
function mergeIntoDocuments(items = [], opts = {}) {
  const dateWindow = Number.isFinite(opts.dateWindowDays) ? opts.dateWindowDays : DEFAULT_DATE_WINDOW_DAYS;
  const titleThreshold = Number.isFinite(opts.titleSimThreshold) ? opts.titleSimThreshold : DEFAULT_TITLE_SIM_THRESHOLD;

  const clusters = [];          // { key, canonical, fingerprint, domain, title, day, items:[] }
  const byCanonical = new Map(); // canonical -> cluster
  const byFingerprint = new Map(); // fingerprint -> cluster

  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const canonical = cleanedUrl(item);
    const fp = fingerprint(item);
    const domain = publisherDomain(item);
    const day = dayOf(item);

    // A) Canonical-URL exakt
    let cluster = canonical ? byCanonical.get(canonical) : null;
    // B) Inhaltsfingerabdruck
    if (!cluster && fp) cluster = byFingerprint.get(fp);
    // C) Herausgeberdomain + Titelaehnlichkeit + Datumsfenster
    if (!cluster && domain) {
      for (const cand of clusters) {
        if (cand.domain && cand.domain === domain
          && daysBetween(cand.day, day) <= dateWindow
          && titleSimilarity(cand.title, item.title) >= titleThreshold) {
          cluster = cand; break;
        }
      }
    }

    if (!cluster) {
      cluster = { canonical: canonical || "", fingerprint: fp || "", domain, title: item.title || "", day, items: [] };
      clusters.push(cluster);
    }
    cluster.items.push(item);
    // Indizes fuellen/erweitern (ein Cluster kann mehrere Canonicals/Fingerprints sammeln)
    if (canonical && !byCanonical.has(canonical)) byCanonical.set(canonical, cluster);
    if (fp && !byFingerprint.has(fp)) byFingerprint.set(fp, cluster);
    if (!cluster.canonical && canonical) cluster.canonical = canonical;
    if (!cluster.fingerprint && fp) cluster.fingerprint = fp;
  }

  return clusters.map((cluster) => buildDocument(cluster));
}

// Waehlt das belastbarste Item als Dokument-Basis und sammelt alle Fundstellen.
function documentRank(item = {}) {
  let s = 0;
  if ((item.linkType || item.link_type) === "direct") s += 20;
  if (item.confidence === "high") s += 10;
  if (cleanedUrl(item)) s += 5;
  return s;
}

function buildDocument(cluster) {
  const items = cluster.items.slice().sort((a, b) => documentRank(b) - documentRank(a));
  const primary = items[0];
  const canonical = cluster.canonical || cleanedUrl(primary) || null;
  // Fundstellen deduplizieren (dieselbe source+URL nur einmal).
  const findings = [];
  const seen = new Set();
  for (const it of items) {
    const f = buildFinding(it);
    const k = `${f.source_id}|${f.original_url}`;
    if (seen.has(k)) continue;
    seen.add(k);
    findings.push(f);
  }
  return {
    id: primary.id || (canonical ? `rd-${sha256(`url:${canonical}`)}` : `rd-${sha256(cluster.fingerprint || cluster.title)}`),
    canonical_url: canonical,
    content_fingerprint: cluster.fingerprint || fingerprint(primary) || null,
    publisher_domain: cluster.domain || publisherDomain(primary) || null,
    title: primary.title || null,
    published_at: primary.publishedAt || primary.published_at || null,
    primary_source_id: primary.sourceId || primary.source_id || null,
    finding_count: findings.length,
    findings
  };
}

function sha256(v) {
  return crypto.createHash("sha256").update(String(v)).digest("hex");
}

// --- Canonical-Extraktion aus HTML (rel=canonical / og:url) ------------------
// Reine Parse-Funktion. Liest die vom Ziel deklarierte Canonical-URL, damit die
// Dedup-Identitaet nicht nur die aufgeloeste, sondern die HERAUSGEBER-eigene ist.
// NICHT im Live-Fetch verdrahtet (Fetch-Verhalten unveraendert).
function extractCanonicalFromHtml(html) {
  const s = String(html || "");
  const linkCanon = /<link[^>]+rel=["']?canonical["']?[^>]*href=["']([^"']+)["']/i.exec(s)
    || /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']?canonical["']?/i.exec(s);
  if (linkCanon && linkCanon[1]) return canonicalizeUrl(linkCanon[1]) || linkCanon[1];
  const og = /<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i.exec(s)
    || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:url["']/i.exec(s);
  if (og && og[1]) return canonicalizeUrl(og[1]) || og[1];
  return "";
}

module.exports = {
  DEFAULT_DATE_WINDOW_DAYS, DEFAULT_TITLE_SIM_THRESHOLD,
  bestUrl, cleanedUrl, publisherDomain,
  titleSimilarity, fingerprint, buildFinding,
  mergeIntoDocuments, buildDocument,
  extractCanonicalFromHtml
};
