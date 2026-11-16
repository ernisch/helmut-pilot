"use strict";

// Geschlossener amtlicher Originalauszug. Bestehender Herkunftskanal und CAS;
// keine allgemeine Feed-/HTML-/Volltextfreigabe, kein Modell und kein neuer Store.
const crypto = require("node:crypto"), { isDeepStrictEqual: same } = require("node:util");
const SOURCE_ID = "eurlex-amtsblatt-l-rss", FEED_URL = "https://eur-lex.europa.eu/DE/display-feed.rss?rssId=222";
const SCOPE = "licensed_legal_excerpt", LICENSE = "EUR-Lex-legal-documents-reuse";
const LICENSE_URL = "https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=en";
const MAX = 240, POSITION = "ACT/ENACTING.TERMS/ARTICLE[1]/ALINEA[1]";
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const hash = x => require("./quellen-lektuerebeleg").hash(x), hex = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const iso = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  && Number.isFinite(Date.parse(x));
const plain = x => require("./quellen-auszug").plain(x);
const exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x)
  && Object.keys(x).sort().join() === keys.slice().sort().join();
const temporaryStatus = n => [408, 425, 429, 500, 502, 503, 504].includes(n);
function retryRecord(row, key) {
  return exact(row, ["version", "schluessel", "versuchId", "zustand", "reserviertAm", "abgeschlossenAm", "reason", "httpStatus", "retryNotBefore"])
    && row.version === 1 && row.schluessel === key && row.zustand === "luecke"
    && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.versuchId)
    && iso(row.reserviertAm) && iso(row.abgeschlossenAm) && row.reserviertAm <= row.abgeschlossenAm
    && temporaryStatus(row.httpStatus) && row.reason === "http-" + row.httpStatus && iso(row.retryNotBefore)
    && Date.parse(row.retryNotBefore) - Date.parse(row.abgeschlossenAm) >= 900000;
}
function catalogApproved(path = {}) {
  return policyActive() && path.id === "rp-" + SOURCE_ID && path.publisher_id === "publisher-eur-lex.europa.eu"
    && path.legacy_source_id === SOURCE_ID && path.url === FEED_URL && path.method === "rss"
    && path.parser === "rss-regex" && ["healthy", "needs_review"].includes(path.status)
    && ["auto", "always_on"].includes(path.activation_mode);
}
function policyActive() {
  const policy = require("./quellenarchitektur/seeds/parlamentsdaten-quellen").PARLAMENTSDATEN_QUELLEN
    .find(s => s.id === SOURCE_ID)?.usagePolicy;
  return policy?.scope === "metadata_and_verified_legal_excerpt" && policy.legalExcerptAllowed === true
    && policy.commercialUseApproved === true && policy.fullTextAllowed === false
    && policy.legalDocumentReuseLicense === LICENSE && policy.maxExcerptCharacters === MAX;
}
function sourceApproved(source = {}) {
  const urls = [source.url, source.rssUrl, ...(Array.isArray(source.rssUrls) ? source.rssUrls : [])].filter(Boolean);
  return source.id === SOURCE_ID && source.retrievalPathId === "rp-" + SOURCE_ID
    && source.eurlexExcerptApproved === true && urls.length > 0 && urls.every(u => u === FEED_URL)
    && (source.rssUrls == null || Array.isArray(source.rssUrls));
}
function proofValid(proof, cellar, text) {
  if (!exact(proof, ["manifestationUri", "itemUrl", "packageSha256", "xmlSha256", "publicationDate", "author",
    "language", "position", "excerptHash", "manifestModifiedAt"]) || !cellar
    || typeof text !== "string" || text !== plain(text) || text.length < 60 || text.length > MAX
    || proof.manifestationUri !== cellar.officialJournalUri + ".DEU.fmx4"
    || proof.publicationDate !== cellar.publicationDate || proof.author !== "Europäische Kommission"
    || proof.language !== "de" || proof.position !== POSITION || proof.excerptHash !== sha(text)
    || !hex(proof.packageSha256) || !hex(proof.xmlSha256) || !iso(proof.manifestModifiedAt)) return false;
  const base = String(cellar.workUri || "").replace("http://", "https://");
  return typeof proof.itemUrl === "string" && proof.itemUrl.startsWith(base + ".")
    && /^\.\d{4}\.\d{2}\/DOC_1$/.test(proof.itemUrl.slice(base.length));
}
function build(source, item, displayTitle) {
  const candidate = item?.cellarExcerpt;
  if (!sourceApproved(source) || !exact(candidate, ["proof", "readAt"]) || !iso(candidate.readAt)
    || !require("./quellen-eurlex-cellar").validateMetadata({ title: item.title, url: item.url,
      publishedAt: item.publishedAt, cellar: item.cellar }) || item.title !== plain(item.title)
    || displayTitle !== item.title.slice(0, 300) || !proofValid(candidate.proof, item.cellar, item.content)
    || Date.parse(candidate.readAt) < Date.parse(item.publishedAt)
    || Date.parse(candidate.readAt) < Date.parse(candidate.proof.manifestModifiedAt)) return null;
  const base = require("./parlamentsdaten-herkunft").baueParlamentsdatenHerkunft(source, item.url,
    displayTitle, item.title.length > 300, item.cellar, item.publishedAt);
  if (!base) return null;
  const record = { ...base, version: 3, scope: SCOPE, originalTitle: item.title,
    originalExcerpt: candidate.proof, readAt: candidate.readAt, license: LICENSE, licenseUrl: LICENSE_URL };
  return { ...record, provenanceHash: hash(record) };
}
function isLegal(value = {}) {
  const m = value.parlamentsdatenHerkunft || value.raw?.parlamentsdatenHerkunft;
  return m && (m.version === 3 || m.scope === SCOPE) && [value.sourceId, value.source_id,
    value.primary_source_id, m.sourceId].includes(SOURCE_ID);
}
function read(value = {}) {
  const m = value.parlamentsdatenHerkunft || value.raw?.parlamentsdatenHerkunft;
  if (m?.version !== 3 || m.sourceId !== SOURCE_ID || m.scope !== SCOPE) return null;
  const ids = [value.sourceId, value.source_id, value.primary_source_id].filter(Boolean);
  const urls = [value.url, value.canonical_url].filter(Boolean);
  const canonical = u => require("./dedup").canonicalizeUrl(u);
  if (!ids.length || ids.some(id => id !== SOURCE_ID) || !urls.length
    || urls.some(u => canonical(u) !== canonical(m.articleUrl))) return null;
  const dates = [value.publishedAt, value.published_at].filter(x => x != null);
  if (!dates.length || dates.some(x => !Number.isFinite(Date.parse(x))
    || new Date(x).toISOString() !== m.retrieval?.publicationDate + "T00:00:00.000Z")) return null;
  const cellar = Object.fromEntries(["workUri", "officialJournalUri", "celex", "publicationDate"].map(k => [k, m.retrieval?.[k]]));
  const expected = build({ id: SOURCE_ID, url: FEED_URL, retrievalPathId: "rp-" + SOURCE_ID, eurlexExcerptApproved: true },
    { title: m.originalTitle, url: m.articleUrl, publishedAt: new Date(dates[0]).toISOString(), cellar,
      content: value.summary != null ? value.summary : value.content,
      cellarExcerpt: { proof: m.originalExcerpt, readAt: m.readAt } }, value.title);
  return expected && same(expected, m) ? expected : null;
}
function text(value) { return read(value) ? (value.summary != null ? value.summary : value.content) : null; }
function contentHash(value) {
  const m = read(value);
  return m ? hash(["eurlex-originalauszug-v1", m.articleUrl, m.originalExcerpt]) : null;
}
function notice(value) {
  const m = read(value); if (!m) return null;
  return { sourceId: SOURCE_ID, scope: SCOPE, articleUrl: m.articleUrl,
    text: `Europäische Kommission. CELEX ${m.identifier.value}, amtliche deutsche Originalfassung, veröffentlicht ${m.retrieval.publicationDate}. Artikel 1, Absatz 1.`,
    originalUrl: m.articleUrl, originalLabel: "Originalrechtstext bei EUR-Lex", licenseUrl: LICENSE_URL,
    changes: `Unveränderter operativer Absatz; weiterer Rechtsakt nicht vollständig übernommen${m.titleTruncated ? "; Titel gekürzt" : ""}. Eigenständige Helmut-Zusammenfassung; keine Bilder. Kein allgemeiner Inkrafttretensnachweis.` };
}

// Nur der native Handler gibt diesen Callback innerhalb seines vorhandenen
// Quellenfensters weiter. Ausserhalb bleibt der gesamte Weg inert.
async function enrich(items, source, deps = {}) {
  const env = deps.env || process.env, now = deps.now || Date.now;
  if (!policyActive() || !sourceApproved(source) || source.crawlMethod !== "rss"
    || !require("./quellen-arbeitsfenster-aktiv").aktiv(env)
    || typeof deps.fetchUrl !== "function" || !Number.isFinite(deps.deadlineMs)) return items;
  // Phasenweise pruefen: die native Standardlease laesst60s zu. Nicht alle
  // maximalen RPC-Zeiten mehrfach vorab addieren; jeder Aufruf hat seine Wache.
  const timeout = require("./verstehen-restzeit").speicherTimeoutMs(env), reserve = 2000;
  const enough = ms => deps.deadlineMs - now() >= ms + reserve;
  let store;
  try { store = deps.speicher || require("./storage").artikelkontextSpeicher(); } catch { return items; }
  if (!store || !["lesen", "reservieren", "abschliessen", "rueckgabeVorAbruf"].every(k => typeof store[k] === "function")) return items;
  const native = store;
  store = Object.fromEntries(["lesen", "reservieren", "abschliessen", "rueckgabeVorAbruf"].map(method => [method, async (...args) => {
    if (!enough(timeout)) throw Error("eurlex-original-restzeit");
    return native[method](...args);
  }]));
  const request = async (url, options) => {
    if (!enough(7000)) throw Error("eurlex-original-restzeit");
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 7000);
    try { return await deps.fetchUrl(url, 0, { ...options, abbruchSignal: abort.signal }); }
    finally { clearTimeout(timer); }
  };
  const result = items.slice(); let started = false;
  for (let i = 0; i < Math.min(items.length, 3); i++) {
    const item = items[i]; if (!enough(7000 + timeout) || !require("./quellen-eurlex-cellar").validateMetadata(item)) break;
    let row, key, reservation, originalStarted = false, closingStarted = false;
    try {
      const manifest = item.cellar.officialJournalUri.replace("http://", "https://") + ".DEU.fmx4";
      const rdf = await request(manifest, { allowedHost: "publications.europa.eu", meldeStatus: true,
        cellar: { kind: "rdf", workUri: item.cellar.workUri, journalUri: item.cellar.officialJournalUri } });
      if (!enough(timeout) || rdf.status !== 200) continue;
      const parsed = require("./quellen-eurlex-original").parseManifestation(rdf.body, item.cellar);
      key = hash(["eurlex-originalauszug-cache-v1", item, parsed]);
      row = await store.lesen(key);
      // Nur ein tatsaechlich quittierter voruebergehender HTTP-Fehler erhaelt
      // genau einen spaeteren Wiederholungsversuch. Eigener Schluessel statt
      // Reset; Timeout/UNKNOWN, Rechte-/Parserfehler bleiben unangetastet.
      if (retryRecord(row, key)) {
        if (now() < Date.parse(row.retryNotBefore)) continue;
        key = hash(["eurlex-originalauszug-wiederholung-v1", key]);
        row = await store.lesen(key);
      }
      if (row !== null) {
        if (exact(row, ["version", "schluessel", "versuchId", "zustand", "reserviertAm", "abgeschlossenAm", "text", "beleg"])
          && row.version === 1 && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.versuchId)
          && row.zustand === "belegt" && iso(row.reserviertAm) && iso(row.abgeschlossenAm)
          && row.schluessel === key && row.reserviertAm <= row.abgeschlossenAm
          && row.reserviertAm <= row.beleg?.readAt && row.beleg?.readAt <= row.abgeschlossenAm) {
          const loaded = { ...item, content: row.text, cellarExcerpt: { proof: row.beleg?.originalExcerpt, readAt: row.beleg?.readAt } };
          if (same(build(source, loaded, item.title.slice(0, 300)), row.beleg)) result[i] = loaded;
        }
        continue; // Negative, fremde oder unbekannte Reservierungen nie neu abrufen.
      }
      if (started || !enough(Math.max(2 * timeout + 7000, 3 * timeout))) continue;
      reservation = { version: 1, schluessel: key, versuchId: crypto.randomUUID(), zustand: "reserviert", reserviertAm: new Date(now()).toISOString() };
      try { await store.reservieren(key, reservation); } catch { /* Readback entscheidet. */ }
      if (!same(await store.lesen(key), reservation)) continue;
      // Nach Quota erneut pruefen. Dauert sie zu lange, reicht der Rest noch
      // fuer die Rueckgabe vor jedem GET; ihren Timeout nicht doppelt zum
      // Original-/Abschlussbudget addieren und damit39s Netzzeit blockieren.
      if (!enough(2 * timeout + 7000)) {
        await store.rueckgabeVorAbruf(key, reservation); continue;
      }
      const quota = await require("./quellen-arbeitsfenster").reserviereOriginal({ env, deps: deps.originalReservierung || {} });
      if (quota?.erlaubt !== true || !enough(7000 + 2 * timeout)) {
        await store.rueckgabeVorAbruf(key, reservation); continue;
      }
      started = true; originalStarted = true;
      const response = await request(parsed.itemUrl, { allowedHost: "publications.europa.eu", meldeStatus: true,
        cellar: { kind: "zip", workUri: item.cellar.workUri, journalUri: item.cellar.officialJournalUri } });
      if (!enough(0) || response.status !== 200 || response.finalUrl !== parsed.itemUrl) throw Error("eurlex-original-antwort-nicht-bestaetigt");
      const extracted = require("./quellen-eurlex-original").extractPackage(response.bytes,
        { title: item.title, cellar: item.cellar, ...parsed });
      const loaded = { ...item, content: extracted.text,
        cellarExcerpt: { proof: extracted.proof, readAt: new Date(now()).toISOString() } };
      const beleg = build(source, loaded, item.title.slice(0, 300));
      if (!beleg) throw Error("eurlex-original-auszug-nicht-bestaetigt");
      const end = { ...reservation, zustand: "belegt", abgeschlossenAm: new Date(now()).toISOString(), text: extracted.text, beleg };
      if (!enough(0)) continue;
      closingStarted = true;
      try { await store.abschliessen(key, reservation.versuchId, end); } catch { /* Kein Erfolg ohne Readback. */ }
      if (same(await store.lesen(key), end)) result[i] = loaded;
    } catch (error) {
      // Nach unklarem Originalausgang keine Rueckgabe/zweiten Abruf. Ein
      // bestaetigter Negativabschluss dokumentiert den Fehler einmalig.
      const httpStatus = error?.statusCode;
      const reason = temporaryStatus(httpStatus) ? "http-" + httpStatus
        : /^eurlex-original-[a-z0-9-]+$/.test(error?.message || "") ? error.message.slice(16) : "abruf-oder-ausgang-nicht-bestaetigt";
      console.warn("[eurlex-original] " + reason);
      if (reservation && originalStarted && !closingStarted && enough(0)) {
        const delay = Math.max(900000, Number(error?.retryAfterMs) || 0), closed = now();
        const retry = temporaryStatus(httpStatus) && Number.isFinite(delay) && delay <= 7 * 86400000
          ? { httpStatus, retryNotBefore: new Date(closed + delay).toISOString() } : {};
        try { await store.abschliessen(key, reservation.versuchId, { ...reservation, zustand: "luecke",
          abgeschlossenAm: new Date(closed).toISOString(), reason, ...retry }); } catch { /* UNKNOWN bleibt reserviert. */ }
      }
    }
  }
  return result;
}
module.exports = { SOURCE_ID, FEED_URL, SCOPE, LICENSE, LICENSE_URL, MAX, catalogApproved, policyActive,
  sourceApproved, proofValid, isLegal, build, read, text, contentHash, notice, enrich };
