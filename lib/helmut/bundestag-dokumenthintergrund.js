"use strict";
// Expressly approved LOCAL exception for one independently read original.
// Document date is background only; it is NEVER publication or today's event.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const VERSION = "helmut-bundestag-originaldokument-hintergrund/1";
const PREFIX = "helmut-bundestag-originaldokument-hintergrund/";
const URL = "https://dserver.bundestag.de/btd/21/084/2108468.pdf", TITLE = "Antwort der Bundesregierung – Zunahme von Zwangsversteigerungen bei privatem Wohneigentum – Drucksache21/8468", EXCERPT = "Deutscher Bundestag Drucksache 21/8468 21. Wahlperiode 08.10.2026\n\nDer Bundesregierung liegen keine über öffentlich verfügbare Informationen hinausgehende Erkenntnisse im Sinne der Fragestellungen vor. Das Statistische Bundesamt erfasst im „Statistischen Bericht – Zivilgerichte“ unter dem Punkt „Zwangsversteigerungen von unbeweglichem Vermögen“ jährlich den tatsächlichen Geschäftsanteil bei den Vollstreckungsgerichten. Auch dem Anfang August 2026 veröffentlichten Bericht ist zu entnehmen, dass der Geschäftsanteil seit 2022 jährlich um circa 2 000 bis 3 000 Verfahren gestiegen ist. Das Statistische Bundesamt zählt dabei nur die juristischen Verfahren (Neueingänge und anhängige Verfahren) auf Ebene der Amtsgerichte. Dabei werden jedoch keine wirtschaftlichen Details wie die genaue Objektart (zum Beispiel Einfamilienhaus, Wohnungseigentum, Gewerbehalle), die genauen Verkehrswerte, die tatsächliche Zuschlagsquote im Gerichtssaal oder Erledigungsart erfasst. Des Weiteren erfolgt keine Unterscheidung zwischen Zwangsversteigerungen aufgrund wirtschaftlicher Gründe (zum Beispiel Zahlungsunfähigkeit der Eigentümer) oder aufgrund der Auflösung einer Eigentümergemeinschaft am Grundstück im Rahmen der sogenannten Teilungsversteigerung.";
const PDF_SHA256 = "136b8729e92d06f92b97b9fdc9ec8aa87d02d12707e5423fe8e6249f528546d7";
const PDF_BYTES = 210052, TEXT_BYTES = 6561;
const TEXT_SHA256 = "ebb6b8bce4d53730af56f0849ed3b0416aa1362f5bafe32b4643fc3f465b4939";
const EXCERPT_SHA256 = "3cc37dc4b868f0f57c072419cb87834cb4aae2f7e7e2922d96f82669ca42966d";
const DOCUMENT_ID = "rd-" + PDF_SHA256, DOCUMENT_DAY = "2026-10-08";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const norm = value => String(value || "").replace(/\s+/g, " ").trim();
const demand = (ok, reason) => { if (!ok) throw Error("bundestag-dokumenthintergrund-" + reason); };
const CORE = Object.freeze({ version: VERSION, pdfSha256: PDF_SHA256, pdfBytes: PDF_BYTES,
  textSha256: TEXT_SHA256, textBytes: TEXT_BYTES, auszugSha256: EXCERPT_SHA256,
  dokumentnummer: "21/8468", dokumentdatum: DOCUMENT_DAY, documentId: DOCUMENT_ID,
  titel: TITLE, url: URL, zeitbasis: "dokumentdatum", quellenrolle: "hintergrund",
  veroeffentlichtAm: null, ereignisdatum: null });
const EXPECTED = Object.freeze({ ...CORE, hash: sha(JSON.stringify(CORE)) });
const plain = v => v && typeof v === "object" && !Array.isArray(v)
  && Object.getPrototypeOf(v) === Object.prototype;
function erzeugeBeleg(pdfBytes, extractedText) {
  demand(Buffer.isBuffer(pdfBytes) && pdfBytes.length === PDF_BYTES && sha(pdfBytes) === PDF_SHA256,
    "original-pdf-bytes");
  demand(typeof extractedText === "string" && Buffer.byteLength(extractedText, "utf8") === TEXT_BYTES
    && sha(extractedText) === TEXT_SHA256, "original-extracted-text");
  const header = extractedText.split("\n").slice(0, 2).join("\n");
  const start = extractedText.indexOf("Der Bundesregierung liegen keine über öffentlich verfügbare Informationen\nhinausgehende Erkenntnisse");
  demand(start >= 0, "original-answer-position");
  const answer = extractedText.slice(start).split(/\n\s*\n/u)[0];
  const unwrap = text => text.replace(/(\p{L})-\r?\n(?=\p{L})/gu, "$1").replace(/\s+/g, " ").trim();
  const excerpt = unwrap(header) + "\n\n" + unwrap(answer);
  demand(excerpt === EXCERPT && excerpt.length === 1243 && sha(excerpt) === EXCERPT_SHA256,
    "original-header-and-answer");
  return Object.freeze({ ...EXPECTED });
}
function relevant(value) {
  return plain(value) && (typeof value.version === "string" && value.version.startsWith(PREFIX)
    || value.zeitbasis === "dokumentdatum" || value.quellenrolle === "hintergrund"
    || value.pdfSha256 === PDF_SHA256);
}
function lese(document = {}) {
  if (!document || typeof document !== "object") return null;
  const supplied = [];
  if (Object.hasOwn(document, "quellenauszug_beleg")) supplied.push(document.quellenauszug_beleg);
  if (document.raw && Object.hasOwn(document.raw, "helmutQuellenkontext")) supplied.push(document.raw.helmutQuellenkontext);
  if (!supplied.some(relevant)) {
    const known = document.id === DOCUMENT_ID || document.content_hash === PDF_SHA256
      || document.url === URL || document.canonical_url === URL;
    demand(!known, "original-proof-required");
    return null;
  }
  // Closed literal values bind this one original. Reconstructing EXPECTED in
  // fixed order makes PostgreSQL JSONB key reordering irrelevant, not trusted.
  demand(supplied.every(value => plain(value) && isDeepStrictEqual(value, EXPECTED)), "metadata-or-alias");
  demand(document.id === DOCUMENT_ID && document.content_hash === PDF_SHA256
    && document.title === TITLE && document.summary === EXCERPT, "original-row-binding");
  demand(document.url === URL && document.canonical_url === URL, "original-url");
  demand(document.source_id === "bundestag" && document.document_type === "Antwort der Bundesregierung"
    && document.published_at === null, "source-type-or-publication");
  for (const key of ["dip_quellfelder", "bundestag_artikelstand", "berlin_artikelstand", "brandenburg_artikelstand"])
    demand(document[key] == null, "conflicting-namespace");
  for (const key of ["helmutDipQuellfelder", "helmutBundestagArtikelstand", "helmutBerlinArtikelstand",
    "helmutBrandenburgLandtagPresseArtikelstand"])
    demand(document.raw?.[key] == null, "conflicting-raw-namespace");
  return Object.freeze({ ...EXPECTED });
}
function contextMetadata() {
  return { herkunft: VERSION, belegt: "Dokumentdatum und Originalhintergrund; keine Publikation oder Ereignispruefung",
    dokumentnummer: CORE.dokumentnummer, dokumentdatum: DOCUMENT_DAY,
    quellenrolle: "hintergrund", zeitbasis: "dokumentdatum", publikationsdatum: null,
    ereignisdatum: null, originalPDFSha256: PDF_SHA256, originalTextSha256: TEXT_SHA256,
    auszugSha256: EXCERPT_SHA256, belegHash: EXPECTED.hash };
}
function quellenangaben(document) { return lese(document) ? contextMetadata() : null; }
function kontextGueltig(source) {
  const meta = source?.dokumentangaben;
  const typed = plain(meta) && (String(meta.herkunft || "").startsWith(PREFIX)
    || meta.zeitbasis === "dokumentdatum" || meta.quellenrolle === "hintergrund");
  if (!typed) return source?.url !== URL; // known PDF cannot strip its proof
  return isDeepStrictEqual(meta, contextMetadata()) && source.url === URL
    && source.titel === TITLE && source.auszug === norm(EXCERPT) && source.veroeffentlichtAm === null;
}
function imFenster(document, begin, end) {
  return Boolean(lese(document) && require("./briefing-frische").berlinTagVollImFenster(DOCUMENT_DAY, begin, end));
}
module.exports = { VERSION, URL, TITLE, PDF_SHA256, PDF_BYTES, TEXT_SHA256, TEXT_BYTES,
  DOCUMENT_ID, DOCUMENT_DAY, EXCERPT, EXCERPT_SHA256, erzeugeBeleg, lese,
  quellenangaben, kontextGueltig, imFenster };
