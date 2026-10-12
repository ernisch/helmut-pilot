"use strict";

// Der Lage-Text darf nur die tatsaechlich geladenen Quellenaussagen verdichten.
// KO-Analysezeit und fruehere Modellzusammenfassungen sind keine Quellenbelege.
const crypto = require("crypto");
const { relevanzTage } = require("./briefing-frische");
const { oeffnendeArtikelUrl } = require("./radarState");
const zeitvertrag = require("./quellen-zeitvertrag");
const VERSION = 4;
const MAX_BELEGE = 6;
const MAX_EINGABE_ZEICHEN = 16000;
const HISTORICAL_RULE = "Historischer Hintergrund: Die so gekennzeichneten Quellen stammen ausschliesslich aus der final angenommenen B2-Aufnahme. Ihre Publikationsdaten bleiben unveraendert. Beschreibe nur den damaligen belegten Sachstand, zeitneutral oder mit ausdruecklichem Quellendatum; behaupte keine heutige Entwicklung, fortdauernde Gueltigkeit oder bevorstehende Frist. Alle Quellen-, Mandatsbezugs- und Qualitaetsregeln gelten unveraendert.";
const text = (value, limit) => {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length > limit ? "" : s;
};

function artikelUrl(value) {
  try {
    const u = new URL(value);
    return !u.username && !u.password ? oeffnendeArtikelUrl(u.href) || null : null;
  } catch { return null; }
}

function quelleIdFuer(vorgangId, ziel, standHash = null) {
  return "q-" + crypto.createHash("sha256").update(vorgangId + "|" + ziel
    + (standHash ? "|" + standHash : "")).digest("hex").slice(0, 20);
}

function baueEingabe(kos, quellen, jetzt = new Date(), env = process.env, historicalSnapshot = null) {
  if (!Number.isFinite(new Date(jetzt).getTime())) throw new Error("lage-quellenzeit-ungueltig");
  let historical = null;
  let contextAdditions = Object.create(null);
  if (historicalSnapshot !== null) {
    const binding = require("./blocker2-d-historical-binding");
    if (!binding.isHistoricalSnapshot(historicalSnapshot)) throw new Error("lage-historischer-kontext-ungeprueft");
    binding.assertProjection(historicalSnapshot, kos, quellen);
    historical = binding.metadata(historicalSnapshot);
    contextAdditions = binding.contextAdditions(historicalSnapshot);
  }
  const ende = historical ? Date.parse(historical.sourceCaptureUTC) : new Date(jetzt).getTime();
  if (!Number.isFinite(ende)) throw new Error("lage-quellenzeit-ungueltig");
  if (historical && new Date(jetzt).getTime() < ende) throw new Error("lage-historischer-kontext-kuenftig");
  const beginn = historical ? -8640000000000000 : ende - relevanzTage(env) * 86400000;
  const frische = require("./briefing-frische");
  const artikelstand = require("./artikelstand");
  const vorgaenge = [];
  // Retain complete accepted event displays inside the same finite context.
  // Reserve them before choosing any source, never append beyond the cap.
  let rest = MAX_EINGABE_ZEICHEN - (kos || []).reduce((sum, ko) => sum
    + (contextAdditions[ko?.vorgang_id] ? JSON.stringify({ teilmitgliedDarstellung: contextAdditions[ko.vorgang_id] }).length : 0), 0);
  for (const ko of kos || []) {
    if (!ko || !ko.vorgang_id) continue;
    const historischerKontext = historical ? { version: historical.version,
      sourceCaptureUTC: historical.sourceCaptureUTC, inputHash: historical.inputHash } : null;
    // The explicit historical label is part of the same finite model budget.
    if (historischerKontext) rest -= JSON.stringify(historischerKontext).length + 40;
    const gesehen = new Set();
    const belege = (quellen[ko.vorgang_id] || []).map((d) => {
      // Ein explizit validierter Artikelstand (Bundestag, Berlin ODER Brandenburg) traegt einen
      // eigenen, tagesgenauen Zeitvertrag. Widerspruechliche Stand-Metadaten werden laut
      // abgewiesen und fallen niemals still auf den URL-Zeitstempel zurueck.
      const treffer = artikelstand.leseStand(d);
      const stand = treffer ? treffer.stand : null;
      const datum = stand ? null : zeitvertrag.publikationsdatum(d.published_at);
      const ziel = artikelUrl(d.canonical_url) || artikelUrl(d.url);
      let auszug;
      if (stand) {
        // Der ganze validierte gebundene Absatz, exakt an den Absatzhash gebunden, wird
        // niemals gekuerzt. Minimierte Leser ohne summary sowie bestehende legacy
        // Zeilen bleiben lesbar, ohne daraus einen Absatz zu erfinden (Titelbeleg).
        auszug = treffer.standModul.standZusammenfassung(d.summary, stand) || "";
      } else {
        const metatext = require("./quellen-auszug").institutionellerMetatext(d.summary);
        auszug = metatext ? "" : text(d.summary, 1400);
        // Ein nichtleerer, aber zu langer Auszug darf nicht verschwinden und
        // seinen Titel als scheinbar unbestrittenen Beleg zuruecklassen.
        if (!metatext && text(d.summary, Infinity) && !auszug) return null;
      }
      const quelle = text(d.source_name, 160);
      const dokumentangaben = require("./dip-quellfelder").quellenangaben(d);
      if (text(d.source_name, Infinity) && !quelle) return null;
      return { stand, beleg: {
        // Unterschiedliche Artikelstaende an derselben URL brauchen eine eigene
        // Belegidentitaet; gewoehnliche Quellen behalten ihren URL-Vertrag.
        quelle_id: quelleIdFuer(ko.vorgang_id, ziel, stand?.standHash),
        titel: text(d.title, 600),
        // Allgemeine Ministeriums-/Portalseiten-Metatexte sind keine aktuelle
        // Artikelaussage. Bestehende Rohdaten bleiben erhalten; fuer den
        // Generator gilt dann ehrlich nur der Titelvertrag.
        auszug, quelle, url: ziel,
        ...(dokumentangaben ? { dokumentangaben } : {}),
        // Der Publikationstag bleibt im Standvertrag exakt YYYY-MM-DD, niemals ein
        // erfundener UTC-Zeitstempel; gewoehnliche Quellen behalten ihren Zeitwert.
        veroeffentlichtAm: stand ? stand.publikationstag : (datum?.iso || null),
        // Normalisierte Angaben behalten dasselbe Kalenderjahr. Nur eine
        // Jahresverschiebung braucht Zusatzmetadaten im begrenzten Kontext;
        // identische Angaben nicht fuer jedes Quelldokument wiederholen.
        ...(datum && datum.jahr !== Number(datum.iso.slice(0, 4))
          ? { zeitbezug: zeitvertrag.zeitbezug(d.published_at) } : {})
      } };
    }).filter((e) => {
      if (!e) return false;
      const d = e.beleg;
      if (!d.url || !d.titel || !d.veroeffentlichtAm) return false;
      // Zeitfenster fail closed: nur wenn der GESAMTE amtliche Publikationstag
      // Europe/Berlin im Lagefenster liegt und nicht kuenftig ist, wird der Stand
      // akzeptiert (Randlage und laufender Tag werden verworfen). Gewoehnliche
      // Quellen behalten unveraendert ihren Zeitstempelvertrag.
      if (e.stand) {
        if (!frische.berlinTagVollImFenster(e.stand.publikationstag, beginn, ende)) return false;
      } else {
        const ms = Date.parse(d.veroeffentlichtAm);
        if (ms < beginn || ms > ende) return false;
      }
      const key = d.url + "|" + d.titel + (e.stand ? "|" + e.stand.standHash : "");
      if (gesehen.has(key)) return false;
      gesehen.add(key);
      return true;
    }).sort((a, b) => b.beleg.veroeffentlichtAm.localeCompare(a.beleg.veroeffentlichtAm)
      || a.beleg.url.localeCompare(b.beleg.url)).slice(0, MAX_BELEGE).filter((e) => {
      const zeichen = JSON.stringify(e.beleg).length + String(ko.vorgang_id).length + 80;
      if (zeichen > rest) return false;
      rest -= zeichen;
      return true;
    }).map((e) => e.beleg);
    if (belege.length) vorgaenge.push({ vorgang_id: ko.vorgang_id, quellenbelege: belege,
      ...(historischerKontext ? { historischerKontext } : {}),
      ...(contextAdditions[ko.vorgang_id] ? { teilmitgliedDarstellung: contextAdditions[ko.vorgang_id] } : {}) });
  }
  return vorgaenge;
}

// Preserve every already selected source. A later run must label its captured
// background without silently dropping sources to make room for that label.
function kennzeichneAufnahme(vorgaenge, snapshot) {
  const meta = require("./blocker2-d-historical-binding").metadata(snapshot);
  const result = vorgaenge.map(v => ({ ...structuredClone(v), historischerKontext: {
    version: meta.version, sourceCaptureUTC: meta.sourceCaptureUTC, inputHash: meta.inputHash } }));
  if (JSON.stringify(result).length > MAX_EINGABE_ZEICHEN)
    throw Error("lage-aufnahme-kontext-budget");
  return result;
}

function hashEingabe(vorgaenge) {
  // JSONB ordnet Objektschluessel beim Speichern neu. Der Beleg bindet den
  // Inhalt, niemals die zufaellige Reihenfolge dieser Schluessel.
  return require("./briefing-speicher").hash({ version: VERSION, vorgaenge });
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
    && Array.isArray(p.quellen_ids) && p.quellen_ids.length === 1 && p.vorgang_ids.length === 1
    && belege.get(p.quellen_ids[0]) === p.vorgang_ids[0]);
}

function cacheGueltig(payload, koSetHash, quellenHash, vorgaenge) {
  return Boolean(payload && payload.quellenVersion === VERSION && payload.koSetHash === koSetHash
    && payload.qualitaet?.version === require("./lage-textqualitaet").VERSION
    && payload.quellenHash === quellenHash && Array.isArray(payload.paragraphs)
    && payload.paragraphs.length > 0
    && gueltigeAbsaetze(payload.paragraphs, vorgaenge).length === payload.paragraphs.length
    && require("./lage-textqualitaet").sachdetailsGebunden(payload.paragraphs, vorgaenge, payload.generatedAt || null));
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

module.exports = { VERSION, MAX_BELEGE, MAX_EINGABE_ZEICHEN, HISTORICAL_RULE, artikelUrl, quelleIdFuer, baueEingabe, kennzeichneAufnahme, hashEingabe, gueltigeAbsaetze, cacheGueltig,
  gespeicherterTextGueltig, bestandErhalten };
