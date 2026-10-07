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
const KEYS_V2 = [...KEYS.slice(0, -1), "vorgangsbezug", "bindung"];
const VORGANG_KEYS = ["id", "titel", "vorgangstyp"];
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
function vorgangsbezuege(values) {
  if (!Array.isArray(values) || values.length > 20) throw new Error("dip-quellfelder-vorgangsbezug");
  const seen = new Set();
  return values.map(v => {
    const id = Number.isSafeInteger(v?.id) && v.id > 0 ? String(v.id) : v?.id;
    if (!objekt(v) || typeof id !== "string" || !/^[1-9]\d{0,11}$/.test(id)
      || seen.has(id) || !feld(v.titel, 600) || !feld(v.vorgangstyp, 120))
      throw new Error("dip-quellfelder-vorgangsbezug");
    seen.add(id);
    return { id, titel: v.titel, vorgangstyp: v.vorgangstyp };
  });
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
    const version = original.vorgangsbezug == null ? 1 : 2;
    const data = { version, herkunft: "dip-api-drucksache", dokumentId: normalisiert.id,
      originaltitel: original.titel, dokumenttyp: typ, dokumentart: art,
      urheber: liste(original.urheber, urheber),
      ressort: liste(original.ressort, ressort),
      datum: publikationsdatum(original.datum)?.original || null,
      ...(version === 2 ? { vorgangsbezug: vorgangsbezuege(original.vorgangsbezug) } : {}), bindung: b };
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
    const keys = b.version === 2 ? KEYS_V2 : KEYS;
    if (!exakt(b, [...keys, "hash"]) || !exakt(b.bindung, BIND_KEYS)
      || ![1, 2].includes(b.version) || b.herkunft !== "dip-api-drucksache" || !/^\d+$/.test(b.dokumentId)
      || !feld(b.originaltitel, 300) || !feld(b.bindung.titel, 300)
      || (b.dokumenttyp !== null && !feld(b.dokumenttyp, 80))
      || (b.dokumentart !== null && !feld(b.dokumentart, 80))
      || (b.datum !== null && !publikationsdatum(b.datum))) return null;
    if (b.urheber !== null && (!Array.isArray(b.urheber) || b.urheber.some(x => !exakt(x, URHEBER_KEYS)))) return null;
    if (b.ressort !== null && (!Array.isArray(b.ressort) || b.ressort.some(x => !exakt(x, RESSORT_KEYS)))) return null;
    if (b.version === 2 && (!Array.isArray(b.vorgangsbezug)
      || b.vorgangsbezug.some(v => !exakt(v, VORGANG_KEYS) || typeof v.id !== "string"))) return null;
    const u = liste(b.urheber, urheber), r = liste(b.ressort, ressort);
    const refs = b.version === 2 ? vorgangsbezuege(b.vorgangsbezug) : null;
    const data = Object.fromEntries(keys.map(k => [k, k === "bindung"
      ? Object.fromEntries(BIND_KEYS.map(f => [f, b.bindung[f]])) : k === "urheber" ? u : k === "ressort" ? r
        : k === "vorgangsbezug" ? refs : b[k]]));
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
    dokumentdatum: b.datum, ereignisdatum: null,
    ...(b.version === 2 ? { vorgangsbezuegeLautDIP: b.vorgangsbezug } : {}) };
}
module.exports = { neu, lese, quellenangaben };
