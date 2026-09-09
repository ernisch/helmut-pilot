"use strict";

// Der Lage-Text darf nur die tatsaechlich geladenen Quellenaussagen verdichten.
// KO-Analysezeit und fruehere Modellzusammenfassungen sind keine Quellenbelege.
const crypto = require("crypto");
const { relevanzTage } = require("./briefing-frische");
const { oeffnendeArtikelUrl } = require("./radarState");
const VERSION = 2;
const MAX_BELEGE = 6;
const MAX_EINGABE_ZEICHEN = 16000;
const text = (value, limit) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);

function datum(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function artikelUrl(value) {
  try {
    const u = new URL(value);
    return !u.username && !u.password ? oeffnendeArtikelUrl(u.href) || null : null;
  } catch { return null; }
}

function baueEingabe(kos, quellen, jetzt = new Date(), env = process.env) {
  const ende = new Date(jetzt).getTime();
  if (!Number.isFinite(ende)) throw new Error("lage-quellenzeit-ungueltig");
  const beginn = ende - relevanzTage(env) * 86400000;
  const vorgaenge = [];
  let rest = MAX_EINGABE_ZEICHEN;
  for (const ko of kos || []) {
    if (!ko || !ko.vorgang_id) continue;
    const gesehen = new Set();
    const belege = (quellen[ko.vorgang_id] || []).map((d) => ({
      quelle_id: "q-" + crypto.createHash("sha256").update(ko.vorgang_id + "|" + (artikelUrl(d.canonical_url) || artikelUrl(d.url))).digest("hex").slice(0, 20),
      titel: text(d.title, 600), auszug: text(d.summary, 1400),
      quelle: text(d.source_name, 160), url: artikelUrl(d.canonical_url) || artikelUrl(d.url),
      veroeffentlichtAm: datum(d.published_at)
    })).filter((d) => {
      if (!d.url || !d.titel || !d.veroeffentlichtAm) return false;
      const ms = Date.parse(d.veroeffentlichtAm);
      if (ms < beginn || ms > ende) return false;
      const key = d.url + "|" + d.titel;
      if (gesehen.has(key)) return false;
      gesehen.add(key);
      return true;
    }).sort((a, b) => b.veroeffentlichtAm.localeCompare(a.veroeffentlichtAm)
      || a.url.localeCompare(b.url)).slice(0, MAX_BELEGE).filter((d) => {
      const zeichen = JSON.stringify(d).length + String(ko.vorgang_id).length + 80;
      if (zeichen > rest) return false;
      rest -= zeichen;
      return true;
    });
    if (belege.length) vorgaenge.push({ vorgang_id: ko.vorgang_id, quellenbelege: belege });
  }
  return vorgaenge;
}

function hashEingabe(vorgaenge) {
  return crypto.createHash("sha256").update(JSON.stringify({ version: VERSION, vorgaenge })).digest("hex");
}

// Ein Absatz mit einer fremden oder fehlenden Referenz bleibt unbelegt. Das
// Entfernen nur der falschen Kennung wuerde den zugehoerigen Text stehen lassen.
function gueltigeAbsaetze(paragraphs, vorgaenge) {
  const erlaubt = new Set((vorgaenge || []).map((v) => v.vorgang_id));
  const belege = new Map((vorgaenge || []).flatMap(v => v.quellenbelege.map(q => [q.quelle_id, v.vorgang_id])));
  return (Array.isArray(paragraphs) ? paragraphs : []).filter((p) => p
    && typeof p.text === "string" && p.text.trim()
    && Array.isArray(p.vorgang_ids) && p.vorgang_ids.length > 0
    && p.vorgang_ids.every((id) => erlaubt.has(id))
    && (!p.quellen_ids || (p.quellen_ids.length === 1 && p.vorgang_ids.length === 1
      && belege.get(p.quellen_ids[0]) === p.vorgang_ids[0])));
}

function cacheGueltig(payload, koSetHash, quellenHash, vorgaenge) {
  return Boolean(payload && payload.quellenVersion === VERSION && payload.koSetHash === koSetHash
    && payload.qualitaet?.version === require("./lage-textqualitaet").VERSION
    && payload.quellenHash === quellenHash && Array.isArray(payload.paragraphs)
    && payload.paragraphs.length > 0
    && gueltigeAbsaetze(payload.paragraphs, vorgaenge).length === payload.paragraphs.length);
}

// Ein alter Tagessatz ist erst wiederverwendbar, wenn der gespeicherte Text
// selbst den heutigen Quellenvertrag traegt. Das ist keine Faktenvollpruefung.
function gespeicherterTextGueltig(payload) {
  try {
    if (!Array.isArray(payload?.quellen) || !payload.quellen.length
      || payload.quellenHash !== hashEingabe(payload.quellen)
      || !cacheGueltig(payload, payload.koSetHash, payload.quellenHash, payload.quellen)
      || !/^[a-f0-9]{32}$/.test(payload.koSetHash || "")
      || payload.paragraphs.length < 2 || payload.paragraphs.length > 4) return false;
    const q = new Map(payload.quellen.flatMap(v => v.quellenbelege.map(d => [d.quelle_id, d])));
    const gesehen = new Set();
    let woerter = 0;
    for (const p of payload.paragraphs) {
      if (p.vorgang_ids.length !== 1 || p.quellen_ids?.length !== 1 || p.belegstellen?.length !== 1) return false;
      const d = q.get(p.quellen_ids[0]), b = p.belegstellen[0];
      const normal = value => String(value || "").replace(/\s+/g, " ").trim();
      if (!d || b.quelle_id !== p.quellen_ids[0] || normal(b.text).length < 12
        || ![d.titel, d.auszug].some(t => normal(t).includes(normal(b.text)))) return false;
      const key = normal(p.text).toLocaleLowerCase("de");
      if (!key || gesehen.has(key) || /\bvorgang_ids\b|\b(?:vg|rd)-[\p{L}0-9][\p{L}0-9-]*|\bq-[a-f0-9]{20}\b/iu.test(p.text)) return false;
      gesehen.add(key); woerter += normal(p.text).split(/\s+/).length;
    }
    return woerter <= 250;
  } catch { return false; }
}

// Erlaubte Reparatur behaelt die komplette vorherige Zeile. Fremde oder
// zwischenzeitliche Aenderungen werden niemals als eigener Erfolg akzeptiert.
function bestandErhalten(before, after) {
  const gleich = require("node:util").isDeepStrictEqual;
  return Boolean(before && after && (gleich(before, after) || (!gespeicherterTextGueltig(before.payload)
    && before.id === after.id && before.user_id === after.user_id && before.slot === "lage" && after.slot === "lage"
    && Date.parse(after.generated_at) > Date.parse(before.generated_at)
    && gespeicherterTextGueltig(after.payload) && gleich(after.payload.vorherigerStand, before))));
}

module.exports = { VERSION, MAX_BELEGE, MAX_EINGABE_ZEICHEN, baueEingabe, hashEingabe, gueltigeAbsaetze, cacheGueltig,
  gespeicherterTextGueltig, bestandErhalten };
