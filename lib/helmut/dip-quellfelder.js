"use strict";

// Begrenzte Originalfelder des vorhandenen DIP Adapters. Das ist eine Bindung
// von Dokumentmetadaten, KEINE Interpretation des Dokuments oder Faktenfreigabe.
// Kein Rohpayload, keine Personenbiografien, kein PDF Volltext. Die oeffentlichen
// Urheber und Ressortlabels werden schon im DIP Pfad gelesen; ihre Rollen sollen
// nicht in einer untypisierten summary verschwinden.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { publikationsdatum } = require("./quellen-zeitvertrag");
const KEYS = ["version", "herkunft", "dokumentId", "originaltitel", "dokumenttyp", "dokumentart",
  "urheber", "ressort", "datum", "bindung"];
const BIND_KEYS = ["titel", "url", "publikation", "typ"];
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const feld = (v, max) => typeof v === "string" && v.trim() && v.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v) ? v : null;
const datum = v => publikationsdatum(v)?.iso || null;
const objekt = v => v && typeof v === "object" && !Array.isArray(v);
const exakt = (v, keys) => objekt(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

function url(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port
      || !["dip.bundestag.de", "dserver.bundestag.de"].includes(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
function liste(v, waehle) {
  if (v === undefined || v === null) return null; // nicht geliefert != leere Liste
  if (!Array.isArray(v) || v.length > 20) throw new Error("dip-quellfelder-liste");
  return v.map(waehle);
}
const URHEBER_KEYS = ["titel", "bezeichnung", "einbringer", "rolle"];
const RESSORT_KEYS = ["titel", "federfuehrend"];
function optionalText(v) {
  if (v == null) return null;
  if (!feld(v, 160)) throw new Error("dip-quellfelder-label");
  return v;
}
function optionalBool(v) {
  if (v == null) return null;
  if (typeof v !== "boolean") throw new Error("dip-quellfelder-rolle");
  return v;
}
function urheber(u) {
  if (!objekt(u) || !feld(u.titel || u.bezeichnung, 160)
    || (u.rolle != null && !["B", "U"].includes(u.rolle))) throw new Error("dip-quellfelder-urheber");
  return { titel: optionalText(u.titel), bezeichnung: optionalText(u.bezeichnung),
    einbringer: optionalBool(u.einbringer), rolle: u.rolle ?? null };
}
function ressort(r) {
  if (!objekt(r) || !feld(r.titel, 160)) throw new Error("dip-quellfelder-ressort");
  return { titel: r.titel, federfuehrend: optionalBool(r.federfuehrend) };
}
function bindung(d) {
  return { titel: d.title || "", url: url(d.url || d.canonical_url),
    publikation: datum(d.publishedAt ?? d.published_at ?? d.date),
    typ: d.documentType ?? d.document_type ?? d.type ?? null };
}
function neu(original, normalisiert) {
  try {
    if (!objekt(original) || !objekt(normalisiert) || !/^\d+$/.test(normalisiert.id)
      || !feld(original.titel, 300) || !feld(normalisiert.title, 300)) return null;
    // Kein Fallbacktyp als gelieferter Dokumenttyp ausgeben.
    const typ = original.drucksachetyp == null ? null : feld(original.drucksachetyp, 80);
    const art = original.dokumentart == null ? null : feld(original.dokumentart, 80);
    if ((original.drucksachetyp != null && !typ) || (original.dokumentart != null && !art)) return null;
    const b = bindung(normalisiert);
    if (!b.url) return null;
    const data = { version: 1, herkunft: "dip-api-drucksache", dokumentId: normalisiert.id,
      originaltitel: original.titel, dokumenttyp: typ, dokumentart: art,
      urheber: liste(original.urheber, urheber),
      ressort: liste(original.ressort, ressort),
      datum: publikationsdatum(original.datum)?.original || null, bindung: b };
    if (JSON.stringify(data).length > 5000) return null;
    return { ...data, hash: hash(data) };
  } catch { return null; }
}
function lese(d = {}) {
  const supplied = [d.dipQuellfelder, d.dip_quellfelder, d.raw?.helmutDipQuellfelder].filter(v => v != null);
  if (!supplied.length) return null;
  try {
    if ((d.sourceId ?? d.source_id) !== "dip") return null;
    // Mehrere Repraesentationen duerfen einander nicht widersprechen.
    const b = supplied[0];
    if (!exakt(b, [...KEYS, "hash"]) || !exakt(b.bindung, BIND_KEYS)
      || b.version !== 1 || b.herkunft !== "dip-api-drucksache" || !/^\d+$/.test(b.dokumentId)
      || !feld(b.originaltitel, 300) || !feld(b.bindung.titel, 300)
      || (b.dokumenttyp !== null && !feld(b.dokumenttyp, 80))
      || (b.dokumentart !== null && !feld(b.dokumentart, 80))
      || (b.datum !== null && !publikationsdatum(b.datum))) return null;
    if (b.urheber !== null && (!Array.isArray(b.urheber) || b.urheber.some(x => !exakt(x, URHEBER_KEYS)))) return null;
    if (b.ressort !== null && (!Array.isArray(b.ressort) || b.ressort.some(x => !exakt(x, RESSORT_KEYS)))) return null;
    const u = liste(b.urheber, urheber), r = liste(b.ressort, ressort);
    const data = Object.fromEntries(KEYS.map(k => [k, k === "bindung"
      ? Object.fromEntries(BIND_KEYS.map(f => [f, b.bindung[f]])) : k === "urheber" ? u : k === "ressort" ? r : b[k]]));
    if (JSON.stringify(data).length > 5000 || b.hash !== hash(data)
      || supplied.some(x => !isDeepStrictEqual(x, b)) || hash(bindung(d)) !== hash(data.bindung)
      || datum(b.datum) !== data.bindung.publikation || !url(data.bindung.url)
      || (d.canonical_url && url(d.canonical_url) !== data.bindung.url)) return null;
    return { ...data, hash: b.hash };
  } catch { return null; }
}
function quellenangaben(d = {}) {
  const b = lese(d);
  if (!b) return null;
  return { herkunft: b.herkunft, belegt: "Dokumentmetadaten, keine Inhaltspruefung",
    quellfelderHash: b.hash, originaltitel: b.originaltitel,
    dokumenttyp: b.dokumenttyp, dokumentart: b.dokumentart,
    urheberLautDIP: b.urheber, ressortLautDIP: b.ressort,
    dokumentdatum: b.datum, ereignisdatum: null };
}
module.exports = { neu, lese, quellenangaben };
