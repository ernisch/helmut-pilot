"use strict";

// Artikeldefekt ist weder Anbieterpause noch unbekannter Ausgang. Nur gebundene
// Eingaben und nativ bestaetigte technische Negativbelege erlauben Abseits.
// Keine Beschaffung, Modelle, Reservierung, Wiedereroeffnung oder Speicherung.
const R = require("./roh-quellenstaende"), B = require("./artikelkontext-belegspeicher"),
  E = require("./quellen-auszug"), { hash } = require("./quellen-lektuerebeleg");
const NEGATIVE = new Set(["strukturierter-artikel-mehrdeutig-oder-fehlend",
  "artikelbereich-mehrdeutig-oder-fehlend", "artikelmetadaten-fehlen",
  "artikelmetadaten-mehrdeutig-oder-fehlend", "keine-artikelabsaetze",
  "leitabsatz-nicht-nutzbar", "artikeltext-unvollstaendig",
  "artikeltitel-abweichend", "artikeldatum-abweichend", "strukturierter-artikel-widerspruch",
  "original-metadaten-gesperrt"]);
const ZIELE = new Set(["artikelziel-nicht-bestaetigt", "quelle-nicht-direkt"]);
const KEYS = ["version", "zustand", "dokumentId", "artikelVersion", "grund", "beleg"];
const sha = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const objekt = v => v && typeof v === "object" && !Array.isArray(v);
const exakt = (v, keys) => objekt(v) && Object.keys(v).sort().join() === keys.slice().sort().join();
function bindung(payload) {
  const ids = payload?.dokumentIds, staende = payload?.quellenstaende;
  if (!Array.isArray(ids) || ids.length !== 1 || !/^rd-[a-f0-9]{64}$/.test(ids[0] || "")
    || !exakt(staende, ids) || !sha(staende[ids[0]])) return null;
  return { id: ids[0], version: staende[ids[0]] };
}
function lese(value, payload) {
  const b = bindung(payload);
  if (!b || !exakt(value, [...KEYS, "zustandsHash"]) || value.version !== 1 || value.zustand !== "abseits"
    || value.dokumentId !== b.id || value.artikelVersion !== b.version || !sha(value.zustandsHash)) return null;
  const p = value.beleg;
  if (value.grund === "kein-bestaetigtes-artikelziel") {
    if (!exakt(p, ["art"]) || p.art !== "gebundener-publisherverweis") return null;
  } else if (!NEGATIVE.has(value.grund) || !exakt(p, ["art", "schluessel", "negativHash"])
    || p.art !== "bestaetigter-extraktionsfehler" || !sha(p.schluessel) || !sha(p.negativHash)) return null;
  const basis = Object.fromEntries(KEYS.map(k => [k, value[k]]));
  return hash(basis) === value.zustandsHash ? structuredClone(value) : null;
}
async function pruefe({ dokument, payload, befund, deadlineMs, now = Date.now } = {}, deps = {}) {
  const reserve = require("./verstehen-restzeit").speicherTimeoutMs(deps.env || process.env) + 1000;
  const zeitGueltig = () => {
    try { const zeit = now(); return Number.isFinite(zeit) && Number.isFinite(deadlineMs) && deadlineMs - zeit >= reserve; }
    catch { return false; }
  };
  if (!zeitGueltig()) return null;
  const b = bindung(payload);
  if (!b || dokument?.id !== b.id || R.standHash(dokument) !== b.version || !E.brauchtInhalt(dokument)) return null;
  const gruende = (Array.isArray(befund) ? befund : []).filter(f => f?.id === b.id);
  if (gruende.length !== 1 || gruende[0].status !== "luecke") return null;
  const grund = gruende[0].reason;
  let beleg, abseitsGrund = grund;
  if (ZIELE.has(grund)) {
    // Ein ausdruecklicher Publisherverweis ist kein bestaetigtes Artikelziel.
    // Fehlende/kaputte Metadaten sind dagegen kein sicherer Negativbeleg.
    if (dokument.link_type !== "publisher" || !["url", "canonical_url", "title"].every(k => Object.hasOwn(dokument, k))
      || dokument.url !== null || dokument.canonical_url !== null
      || typeof dokument.title !== "string" || !dokument.title.trim()) return null;
    abseitsGrund = "kein-bestaetigtes-artikelziel"; beleg = { art: "gebundener-publisherverweis" };
  } else {
    if (!NEGATIVE.has(grund)) return null;
    let speicher;
    try { speicher = deps.artikelBelegspeicher || require("./storage").artikelkontextSpeicher(); }
    catch { return null; }
    if (typeof speicher?.lesen !== "function") return null;
    const lesen = async key => {
      if (!zeitGueltig()) throw Error("keine-lesereserve");
      return speicher.lesen(key);
    };
    try {
      // Positive und unklare aeltere Verfahren haben Vorrang vor Quarantaene.
      const alt = B.bereiteArtikelkontextVor(dokument, { versuch: true });
      if (!alt.ok) return null;
      const a = await lesen(alt.key);
      if (a !== null && (a?.zustand !== "luecke"
        || !NEGATIVE.has(B.pruefeBelegstand(alt.doc, alt.key, a).reason))) return null;
      const opts = { versuch: true, kontext: "einstieg" }, neu = B.bereiteArtikelkontextVor(dokument, opts);
      if (!neu.ok) return null;
      let key = neu.key, stand = await lesen(key);
      const folge = B.bereiteQuellenlayoutFolge(neu, stand, opts);
      if (folge) { key = folge.key; stand = await lesen(key); }
      if (stand?.zustand !== "luecke" || B.pruefeBelegstand(neu.doc, key, stand, "einstieg").reason !== grund) return null;
      beleg = { art: "bestaetigter-extraktionsfehler", schluessel: key, negativHash: hash(stand) };
    } catch { return null; }
  }
  if (!zeitGueltig()) return null;
  const basis = { version: 1, zustand: "abseits", dokumentId: b.id, artikelVersion: b.version,
    grund: abseitsGrund, beleg };
  return { ...basis, zustandsHash: hash(basis) };
}
module.exports = { lese, pruefe };
