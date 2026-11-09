"use strict";

// Reiner Speicheradapter ohne Abhaengigkeit vom Abruf oder von Nutzerpfaden.
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

// Eigene globale helmut_store Zeile je Dokument, Quellenstand und Verfahren.
// Kein Upsert, kein Blob Cache, keine lokale Ausweichablage, keine Retry Schleife.
// Auch bei verlorener Schreibantwort entscheidet ausschliesslich das Neu Lesen.
function erzeugeBelegspeicher({ request, storeId }) {
  if (typeof request !== "function" || typeof storeId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(storeId)
    || storeId.includes("-p-")) throw new Error("artikelkontext-speicher-konfiguration");
  function id(key) {
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) throw new Error("artikelkontext-speicher-schluessel");
    return storeId + "-artikelkontext-" + key;
  }
  return {
    async lesen(key) {
      const rowId = id(key);
      const rows = await request(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(rowId)}&select=id,data`);
      if (!Array.isArray(rows) || rows.length > 1 || (rows.length && (rows[0].id !== rowId
        || !rows[0].data || typeof rows[0].data !== "object" || Array.isArray(rows[0].data)))) throw new Error("artikelkontext-speicher-leseantwort");
      return rows.length ? rows[0].data : null;
    },
    async reservieren(key, data) {
      if (data?.zustand !== "reserviert" || data.schluessel !== key || !uuid(data.versuchId)) throw new Error("artikelkontext-reservierung");
      await request("/rest/v1/helmut_store?select=id", { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id: id(key), data }) });
    },
    async rueckgabeVorAbruf(key, reservation) {
      if (reservation?.zustand !== "reserviert" || reservation.schluessel !== key || !uuid(reservation.versuchId))
        throw new Error("artikelkontext-rueckgabe");
      await request(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(id(key))}`
        + `&data=eq.${encodeURIComponent(JSON.stringify(reservation))}&select=id`,
      { method: "DELETE", headers: { Prefer: "return=representation" } });
    },
    async abschliessen(key, versuchId, data) {
      if (!uuid(versuchId) || data?.versuchId !== versuchId || data.schluessel !== key
        || !["belegt", "luecke"].includes(data.zustand)) throw new Error("artikelkontext-abschluss");
      await request(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(id(key))}`
        + `&data-%3E%3EversuchId=eq.${versuchId}&data-%3E%3Ezustand=eq.reserviert&select=id`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data }) });
    }
  };
}

const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const A = require("./artikelkontext");
const S = require("./artikelkontext-abrufschutz");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const luecke = reason => ({ ok: false, reason });

const zeit = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value));

function bestaetigterStand(doc, key, data) {
  if (!data || data.version !== 1 || data.schluessel !== key || !uuid(data.versuchId) || !zeit(data.reserviertAm)) {
    return luecke("belegstand-ungueltig");
  }
  const base = { version: 1, schluessel: key, versuchId: data.versuchId, reserviertAm: data.reserviertAm, zustand: data.zustand };
  if (data.zustand === "reserviert" && isDeepStrictEqual(data, base)) return luecke("abruf-ausgang-offen");
  if (!zeit(data.abgeschlossenAm) || data.abgeschlossenAm < data.reserviertAm) return luecke("belegstand-ungueltig");
  base.abgeschlossenAm = data.abgeschlossenAm;
  if (data.zustand === "luecke" && typeof data.reason === "string" && /^[a-z0-9-]{1,100}$/.test(data.reason)
    && isDeepStrictEqual(data, { ...base, reason: data.reason })) return luecke(data.reason);
  if (data.zustand === "belegt") {
    try {
      const beleg = A.pruefeArtikelkontext([doc], data.beleg);
      if (beleg.version === 2 && beleg.gelesenAm >= data.reserviertAm && beleg.gelesenAm <= data.abgeschlossenAm
        && isDeepStrictEqual(data, { ...base, beleg })) return { ok: true, beleg };
    } catch { /* Eine strukturell kaputte Ablage ist kein neuer Abrufauftrag. */ }
  }
  return luecke("belegstand-ungueltig");
}
// Derselbe Quellen-/Verfahrensschluessel fuer Beschaffung und reine Leser.
// Keine Abhaengigkeit vom Crawler oder dessen parlamentarischen Dispatchern.
function bereiteArtikelkontextVor(document, opts = {}) {
  if (require("./parlamentsdaten-herkunft").istParlamentsdatenDokument(document)) return luecke("quelle-nur-metadaten");
  // Vor erstem await festhalten. Ein Aufrufer darf nach der Reservierung weder
  // Quelle noch Artikelziel des laufenden Versuchs verschieben.
  let doc, key, host;
  try {
    doc = structuredClone(document);
    host = S.artikelHost(doc.url);
    const quellenHash = A.quellenstandHash(doc);
    // Nur die vorhandene Quellenbindung pruefen; dieser Platzhalter wird nie
    // gespeichert, zurueckgegeben oder in einen Prompt uebernommen.
    A.pruefeArtikelkontext([doc], { version: 1, herkunft: "manueller-originalvergleich", dokumentId: doc.id,
      quellenHash, artikelUrl: doc.url, artikelTitel: doc.title, absatzPosition: 1, text: "Strukturpruefung",
      gelesenAm: "2026-01-01T00:00:00.000Z" });
    key = hash(JSON.stringify([opts.kontext === "einstieg" ? "artikelkontext-einstieg-v2" : "artikelkontext-abruf-v1", doc.id, quellenHash]));
  } catch { return luecke("quelle-nicht-gebunden"); }
  const sicherheit = require("./sourceSafety").assessLink(doc.url);
  if (sicherheit.blocked || sicherheit.suspicious || sicherheit.shortener || sicherheit.aggregator)
    return luecke("quelle-nicht-zulaessig");
  return { ok: true, doc, key, host };
}
function pruefeBelegstand(doc, key, value, kontext) {
  const result = bestaetigterStand(doc, key, value);
  // Derselbe Reservierungsschluessel bleibt erhalten: ein alter Praefixbeleg
  // ist kein Auftrag fuer einen zweiten Original-GET desselben Quellenstands.
  return result.ok && kontext === "einstieg" && !["artikel-einstieg-v2", "artikeltext-v3", "artikelabschnitte-v4"].includes(result.beleg.gewinnung?.verfahren)
    ? luecke("gewinnungsverfahren-abweichend") : result;
}
async function leseArtikelkontextStand(document, opts = {}, deps = {}) {
  const vorbereitet = bereiteArtikelkontextVor(document, opts);
  if (!vorbereitet.ok) return vorbereitet;
  const { doc, key } = vorbereitet;
  let speicher;
  try { speicher = deps.speicher || require("./storage").artikelkontextSpeicher(); }
  catch { return luecke("belegspeicher-nicht-verfuegbar"); }
  if (typeof speicher?.lesen !== "function") return luecke("belegspeicher-nicht-verfuegbar");
  let stand;
  try { stand = await speicher.lesen(key); } catch { return luecke("belegstand-nicht-lesbar"); }
  return stand === null ? luecke("beleg-fehlt") : pruefeBelegstand(doc, key, stand, opts.kontext);
}
async function leseArtikelkontext(document, deps = {}) {
  let result = await leseArtikelkontextStand(document, {}, deps);
  if (!result.ok) result = await leseArtikelkontextStand(document, { kontext: "einstieg" }, deps);
  return result;
}

module.exports = { erzeugeBelegspeicher, uuid, bereiteArtikelkontextVor, pruefeBelegstand,
  leseArtikelkontextStand, leseArtikelkontext };
