"use strict";

// Ausdruecklicher Einzelabruf. Kein selbststaendiger Einstieg, keine
// Profilmutation, kein Modellaufruf und keine automatische Wiederaufnahme.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const A = require("./artikelkontext");
const G = require("./artikelkontext-gewinnung");
const S = require("./artikelkontext-abrufschutz");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const luecke = reason => ({ ok: false, reason });
const { erzeugeBelegspeicher, uuid } = require("./artikelkontext-belegspeicher");
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
async function beschaffeArtikelkontext(document, opts = {}, deps = {}) {
  if (!opts || !Object.hasOwn(opts, "versuch") || opts.versuch !== true) return luecke("versuch-nicht-angefordert");
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
    key = hash(JSON.stringify(["artikelkontext-abruf-v1", doc.id, quellenHash]));
  } catch { return luecke("quelle-nicht-gebunden"); }
  let speicher;
  try { speicher = deps.speicher || require("./storage").artikelkontextSpeicher(); }
  catch { return luecke("belegspeicher-nicht-verfuegbar"); }
  if (!speicher || !["lesen", "reservieren", "abschliessen"].every(k => typeof speicher[k] === "function")) return luecke("belegspeicher-nicht-verfuegbar");
  let stand;
  try { stand = await speicher.lesen(key); } catch { return luecke("belegstand-nicht-lesbar"); }
  if (stand !== null) return bestaetigterStand(doc, key, stand);
  const env = deps.env || process.env;
  if (!require("./anbieter-steuerung").steuerungAktiv(env)) return luecke("anbietersteuerung-nicht-aktiv");
  if (typeof deps.erlaubeNeuenAbruf === "function") {
    let grund;
    try { grund = deps.erlaubeNeuenAbruf(); } catch { return luecke("laufgrenze-nicht-pruefbar"); }
    if (grund !== null) return luecke(typeof grund === "string" && /^[a-z0-9-]{1,100}$/.test(grund)
      ? grund : "laufgrenze-nicht-pruefbar");
  }
  const now = deps.now || (() => new Date());
  const reservation = { version: 1, schluessel: key, versuchId: crypto.randomUUID(),
    reserviertAm: now().toISOString(), zustand: "reserviert" };
  try { await speicher.reservieren(key, reservation); } catch { /* Neu Lesen, nie blind wiederholen. */ }
  try { stand = await speicher.lesen(key); } catch { return luecke("reservierung-nicht-bestaetigt"); }
  if (!isDeepStrictEqual(stand, reservation)) return stand ? bestaetigterStand(doc, key, stand) : luecke("reservierung-nicht-bestaetigt");
  let result;
  try {
    const response = await (deps.fetchUrl || require("./crawler").fetchUrl)(doc.url, 0,
      { ...deps.abruf, env, artikelkontext: true, allowedHost: host.replace(/^www\./, "") });
    // Keine vom Herausgeber oder von JSON LD behauptete Lesezeit uebernehmen.
    result = G.gewinneArtikelkontext(doc, { ...response, gelesenAm: now().toISOString() });
  } catch (error) {
    const reason = error?.anbieterVertagung ? "anbietergrenze" : Number.isInteger(error?.statusCode) ? "http-status" : /^artikelkontext-[a-z0-9-]{1,100}$/.test(error?.message || "")
      ? error.message.slice("artikelkontext-".length) : "abruf-fehlgeschlagen";
    result = luecke(reason);
  }
  const end = { ...reservation, zustand: result.ok ? "belegt" : "luecke", abgeschlossenAm: now().toISOString(),
    ...(result.ok ? { beleg: result.beleg } : { reason: result.reason }) };
  // Ungueltige Uhr/Ergebnis darf auch im fehlerhaften Adapterfall kein Gruen liefern.
  const checked = bestaetigterStand(doc, key, end);
  if (checked.reason === "belegstand-ungueltig") return checked;
  try { await speicher.abschliessen(key, reservation.versuchId, end); } catch { /* Ausgang anhand der Ablage pruefen. */ }
  try { stand = await speicher.lesen(key); } catch { return luecke("abschluss-nicht-bestaetigt"); }
  if (!isDeepStrictEqual(stand, end)) return luecke("abschluss-nicht-bestaetigt");
  return bestaetigterStand(doc, key, stand);
}
module.exports = { beschaffeArtikelkontext, erzeugeBelegspeicher };
