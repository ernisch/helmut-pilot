"use strict";

// Offizieller Ersatz fuer den geblockten EUR-Lex-Titelfeed. Nur Metadaten:
// kein HTML-/Volltextabruf, keine Anmeldung und kein weiterer Netzweg.
const ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const MAX_ITEMS = 16;
const MAX_BYTES = 256 * 1024;
const CDM = "http://publications.europa.eu/ontology/cdm#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const CELEX = /^[23][0-9]{4}[A-Z][0-9]{4}(?:R\([0-9]{2}\)|\([0-9]{2}\))?$/;
const FIELDS = ["work", "celex", "published", "ojIdentity", "title"];
const META_FIELDS = ["workUri", "officialJournalUri", "celex", "publicationDate"];
const DAY_MS = 86400000;

function fail(reason) { throw new Error("eurlex-cellar-" + reason); }
function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function keys(value, fields) {
  return object(value) && Object.keys(value).length === fields.length
    && fields.every(field => Object.hasOwn(value, field));
}
function date(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + "T00:00:00.000Z"))
    && new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
}
function windowFor(now = new Date()) {
  const parsed = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(parsed.getTime())) fail("zeitpunkt-ungueltig");
  const end = parsed.toISOString().slice(0, 10);
  const start = new Date(Date.parse(end + "T00:00:00.000Z") - 13 * DAY_MS).toISOString().slice(0, 10);
  return { start, end };
}
function limitFor(value = MAX_ITEMS) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_ITEMS) fail("limit-ungueltig");
  return value;
}

function buildQuery(now = new Date(), maxItems = MAX_ITEMS) {
  const { start, end } = windowFor(now), limit = limitFor(maxItems);
  // Seit Oktober 2023 liegt das echte OJ-Datum direkt am Einzelakt. Das
  // Beschlussdatum work_date_document und Ingestionszeiten sind kein Ersatz.
  return `PREFIX cdm: <${CDM}>
PREFIX xsd: <${XSD}>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
SELECT DISTINCT ?work ?celex ?published ?ojIdentity ?title WHERE {
 ?work cdm:official-journal-act_part_of_collection_document <http://publications.europa.eu/resource/authority/document-collection/OJ-L> ;
       cdm:official-journal-act_date_publication ?published ;
       cdm:resource_legal_id_celex ?celex ;
       owl:sameAs ?ojIdentity .
 FILTER (?published >= "${start}"^^xsd:date && ?published <= "${end}"^^xsd:date)
 FILTER (REGEX(STR(?ojIdentity), "^http://publications[.]europa[.]eu/resource/oj/L_[0-9]{9}$"))
 FILTER (REGEX(STR(?celex), "^[23][0-9]{4}[A-Z][0-9]{4}(R\\\\([0-9]{2}\\\\)|\\\\([0-9]{2}\\\\))?$"))
 ?expression cdm:expression_belongs_to_work ?work ;
    cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/DEU> ;
    cdm:expression_title ?title .
} ORDER BY DESC(?published) ASC(?celex)
LIMIT ${limit}`;
}

function validiereHerkunft(cellar, articleUrl, publishedAt) {
  if (!keys(cellar, META_FIELDS)
    || !/^http:\/\/publications\.europa\.eu\/resource\/cellar\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cellar.workUri || "")
    || !CELEX.test(cellar.celex || "") || !date(cellar.publicationDate)) return false;
  const oj = /^http:\/\/publications\.europa\.eu\/resource\/oj\/L_([0-9]{4})[0-9]{5}$/.exec(cellar.officialJournalUri || "");
  if (!oj || oj[1] !== cellar.publicationDate.slice(0, 4)
    || typeof publishedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0{1,3})?(?:Z|\+00:00)$/.test(publishedAt)
    || Date.parse(publishedAt) !== Date.parse(cellar.publicationDate + "T00:00:00.000Z")) return false;
  try {
    const url = new URL(articleUrl);
    return url.protocol === "https:" && url.hostname === "eur-lex.europa.eu"
      && !url.username && !url.password && !url.port && !url.hash
      && url.pathname === "/legal-content/DE/TXT/"
      && [...url.searchParams].length === 1
      && url.searchParams.get("uri") === "CELEX:" + cellar.celex;
  } catch { return false; }
}

function validateMetadata(item) {
  return keys(item, ["title", "url", "publishedAt", "cellar"])
    && typeof item.title === "string" && item.title.length > 0 && item.title.length <= 4000
    && !/[<>\u0000-\u001f\u007f]/.test(item.title)
    && item.title === item.title.replace(/\s+/g, " ").trim()
    && validiereHerkunft(item.cellar, item.url, item.publishedAt);
}

function nodeValue(node, type, options = {}) {
  if (!object(node) || node.type !== type || typeof node.value !== "string"
    || Object.keys(node).some(key => !["type", "value", "datatype", "xml:lang"].includes(key))) fail("bindung-ungueltig");
  if (type === "uri" && !keys(node, ["type", "value"])) fail("uri-ungueltig");
  if (options.datatype && node.datatype !== options.datatype) fail("datentyp-ungueltig");
  if (type === "literal" && Object.hasOwn(node, "datatype")
    && node.datatype !== (options.datatype || XSD + "string")) fail("datentyp-ungueltig");
  if (Object.hasOwn(node, "xml:lang")
    && (node["xml:lang"] !== "de" || Object.hasOwn(node, "datatype"))) fail("sprache-ungueltig");
  return node.value;
}

function parseResponse(body, { now = new Date(), maxItems = MAX_ITEMS } = {}) {
  const limit = limitFor(maxItems), { start, end } = windowFor(now);
  if (typeof body !== "string" || Buffer.byteLength(body, "utf8") > MAX_BYTES) fail("antwort-zu-gross-oder-ungueltig");
  let response;
  try { response = JSON.parse(body); } catch { fail("json-ungueltig"); }
  if (!keys(response, ["head", "results"]) || !object(response.head)
    || !Array.isArray(response.head.vars) || response.head.vars.length !== FIELDS.length
    || !FIELDS.every(field => response.head.vars.includes(field))
    || !object(response.results) || !Array.isArray(response.results.bindings)
    || response.results.bindings.length > limit) fail("antwort-ungueltig");
  const items = [], byCelex = new Map(), byJournal = new Map();
  for (const row of response.results.bindings) {
    if (!keys(row, FIELDS)) fail("bindung-ungueltig");
    const celex = nodeValue(row.celex, "literal", { datatype: XSD + "string" });
    const publicationDate = nodeValue(row.published, "literal", { datatype: XSD + "date" });
    const title = nodeValue(row.title, "literal").replace(/\s+/g, " ").trim();
    const item = {
      title, url: "https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:" + encodeURIComponent(celex),
      publishedAt: publicationDate + "T00:00:00.000Z",
      cellar: {
        workUri: nodeValue(row.work, "uri"), officialJournalUri: nodeValue(row.ojIdentity, "uri"),
        celex, publicationDate
      }
    };
    if (!validateMetadata(item) || publicationDate < start || publicationDate > end) fail("metadaten-ungueltig");
    const signature = JSON.stringify(item), seen = byCelex.get(celex), journalSeen = byJournal.get(item.cellar.officialJournalUri);
    if ((seen && seen !== signature) || (journalSeen && journalSeen !== celex)) fail("metadaten-widerspruch");
    if (!seen) items.push(item);
    byCelex.set(celex, signature); byJournal.set(item.cellar.officialJournalUri, celex);
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.cellar.celex.localeCompare(b.cellar.celex));
}

async function crawl({ fetchUrl, now = new Date(), maxItems = MAX_ITEMS } = {}) {
  if (typeof fetchUrl !== "function") fail("transport-fehlt");
  const query = buildQuery(now, maxItems);
  const url = ENDPOINT + "?" + new URLSearchParams({ query, format: "application/sparql-results+json" });
  const response = await fetchUrl(url, 0, { allowedHost: "publications.europa.eu", meldeStatus: true });
  if (!response || response.status !== 200) {
    const error = new Error("HTTP " + String(response?.status || "unknown") + " for EUR-Lex CELLAR");
    if (Number.isInteger(response?.status)) error.statusCode = response.status;
    throw error;
  }
  if (response.finalUrl !== url) fail("antwortziel-abweichend");
  return parseResponse(response.body, { now, maxItems });
}

module.exports = { ENDPOINT, MAX_ITEMS, MAX_BYTES, buildQuery, parseResponse,
  validiereHerkunft, validateMetadata, crawl };
