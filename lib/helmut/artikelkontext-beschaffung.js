"use strict";

// Ausdruecklicher Einzelabruf. Kein selbststaendiger Einstieg, keine
// Profilmutation, kein Modellaufruf und keine automatische Wiederaufnahme.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const G = require("./artikelkontext-gewinnung");
const luecke = reason => ({ ok: false, reason });
const { erzeugeBelegspeicher, bereiteArtikelkontextVor, pruefeBelegstand, leseArtikelkontextStand,
  bereiteQuellenlayoutFolge, leseArtikelkontext } = require("./artikelkontext-belegspeicher");
async function beschaffeArtikelkontext(document, opts = {}, deps = {}) {
  if (!opts || !Object.hasOwn(opts, "versuch") || opts.versuch !== true) return luecke("versuch-nicht-angefordert");
  if (opts.kontext !== undefined && opts.kontext !== "einstieg") return luecke("gewinnung-unbekannt");
  if (opts.nurBestand === true) return leseArtikelkontextStand(document, opts, deps);
  const vorbereitet = bereiteArtikelkontextVor(document, opts);
  if (!vorbereitet.ok) return vorbereitet;
  const { doc, host } = vorbereitet;
  let key = vorbereitet.key;
  let speicher;
  const pruefeStand = (d, k, value) => pruefeBelegstand(d, k, value, opts.kontext);
  try { speicher = deps.speicher || require("./storage").artikelkontextSpeicher(); }
  catch { return luecke("belegspeicher-nicht-verfuegbar"); }
  if (!speicher || !["lesen", "reservieren", "abschliessen"].every(k => typeof speicher[k] === "function")) return luecke("belegspeicher-nicht-verfuegbar");
  let stand;
  try { stand = await speicher.lesen(key); } catch { return luecke("belegstand-nicht-lesbar"); }
  let bestand = stand === null ? null : pruefeStand(doc, key, stand);
  if (bestand?.ok) return bestand;
  const folge = bereiteQuellenlayoutFolge(vorbereitet, stand, opts);
  if (folge) {
    key = folge.key;
    try { stand = await speicher.lesen(key); } catch { return luecke("belegstand-nicht-lesbar"); }
    bestand = stand === null ? null : pruefeStand(doc, key, stand);
    if (bestand?.ok) return bestand;
  }
  // Der alte Eagereinstieg darf denselben Quellenstand nicht erneut abrufen,
  // wenn der globale Lauf bereits einen Einstieg belegt oder versucht hat.
  // Nur ein tatsaechlich fehlender v2-Stand erlaubt den bisherigen v1-Auftrag.
  if (opts.einstiegBestand === true && opts.kontext === undefined) {
    const einstieg = await beschaffeArtikelkontext(doc,
      { versuch: true, nurBestand: true, kontext: "einstieg" }, { ...deps, speicher });
    if (einstieg.ok || einstieg.reason !== "beleg-fehlt") return einstieg;
  }
  if (bestand) return bestand;
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
  if (!isDeepStrictEqual(stand, reservation)) return stand ? pruefeStand(doc, key, stand) : luecke("reservierung-nicht-bestaetigt");
  let result;
  try {
    // Globale Tagesreservierung erst nach bestaetigter eigener Cachebelegung.
    // Dieselbe oeffentliche Artikelversion wird bei Wiederverwendung nicht belastet.
    if (require("./quellen-arbeitsfenster").aktiv(env)) {
      const limit = await require("./quellen-arbeitsfenster").reserviereOriginal({ env,
        deps: deps.originalReservierung || {} });
      if (limit?.erlaubt !== true) {
        const error = new Error("original-tagesgrenze");
        error.anbieterVertagung = { vorAbruf: true, grund: limit?.grund || "nicht-pruefbar" };
        error.originalTagesgrenze = true;
        throw error;
      }
    }
    const response = await (deps.fetchUrl || require("./crawler").fetchUrl)(doc.url, 0,
      { ...deps.abruf, env, artikelkontext: true, allowedHost: host.replace(/^www\./, "") });
    // Keine vom Herausgeber oder von JSON LD behauptete Lesezeit uebernehmen.
    result = (opts.kontext === "einstieg" ? G.gewinneArtikeltext : G.gewinneArtikelkontext)(doc,
      { ...response, gelesenAm: now().toISOString() },
      { abschnittsweise: require("./quellen-arbeitsfenster").aktiv(env) });
  } catch (error) {
    // Nur die ausdruecklich VOR dem HTTP-Aufruf verweigerte Anbieterreservierung
    // ist kein Originalversuch. Eigene unveraenderte Reservierung atomar freigeben;
    // verlorene Antwort nachlesen. Jeder gestartete/unklare Abruf bleibt gesperrt.
    if (error?.anbieterVertagung?.vorAbruf === true && typeof speicher.rueckgabeVorAbruf === "function") {
      try { await speicher.rueckgabeVorAbruf(key, reservation); } catch { /* Ausgang nachlesen. */ }
      try { stand = await speicher.lesen(key); } catch { return luecke("rueckgabe-nicht-bestaetigt"); }
      if (stand === null) return luecke(error.originalTagesgrenze ? "original-tagesgrenze" : "anbietergrenze");
      return luecke("rueckgabe-nicht-bestaetigt");
    }
    const reason = error?.anbieterVertagung ? "anbietergrenze" : Number.isInteger(error?.statusCode) ? "http-status" : /^artikelkontext-[a-z0-9-]{1,100}$/.test(error?.message || "")
      ? error.message.slice("artikelkontext-".length) : "abruf-fehlgeschlagen";
    result = luecke(reason);
  }
  const end = { ...reservation, zustand: result.ok ? "belegt" : "luecke", abgeschlossenAm: now().toISOString(),
    ...(result.ok ? { beleg: result.beleg } : { reason: result.reason }) };
  // Ungueltige Uhr/Ergebnis darf auch im fehlerhaften Adapterfall kein Gruen liefern.
  const checked = pruefeStand(doc, key, end);
  if (checked.reason === "belegstand-ungueltig") return checked;
  try { await speicher.abschliessen(key, reservation.versuchId, end); } catch { /* Ausgang anhand der Ablage pruefen. */ }
  try { stand = await speicher.lesen(key); } catch { return luecke("abschluss-nicht-bestaetigt"); }
  if (!isDeepStrictEqual(stand, end)) return luecke("abschluss-nicht-bestaetigt");
  return pruefeStand(doc, key, stand);
}
module.exports = { beschaffeArtikelkontext, leseArtikelkontext, erzeugeBelegspeicher };
