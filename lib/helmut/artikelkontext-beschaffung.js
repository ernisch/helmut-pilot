"use strict";

// Ausdruecklicher Einzelabruf. Kein selbststaendiger Einstieg, keine
// Profilmutation, kein Modellaufruf und keine automatische Wiederaufnahme.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const G = require("./artikelkontext-gewinnung");
const W = require("./artikelkontext-wiedergewinnung");
const luecke = reason => ({ ok: false, reason });
const { erzeugeBelegspeicher, bereiteArtikelkontextVor, pruefeBelegstand, leseArtikelkontextStand,
  leseAktuellenArtikelstand, leseArtikelkontext } = require("./artikelkontext-belegspeicher");
async function beschaffeArtikelkontext(document, opts = {}, deps = {}) {
  if (!opts || !Object.hasOwn(opts, "versuch") || opts.versuch !== true) return luecke("versuch-nicht-angefordert");
  if (opts.kontext !== undefined && opts.kontext !== "einstieg") return luecke("gewinnung-unbekannt");
  if (opts.nurBestand === true) return leseArtikelkontextStand(document, opts, deps);
  const vorbereitet = bereiteArtikelkontextVor(document, opts);
  if (!vorbereitet.ok) return vorbereitet;
  const { doc, host } = vorbereitet;
  const key = vorbereitet.key, wiedergewinnung = deps.wiedergewinnung || W.standard;
  let speicher;
  const pruefeStand = (d, k, value) => pruefeBelegstand(d, k, value, opts.kontext);
  try { speicher = deps.speicher || require("./storage").artikelkontextSpeicher(); }
  catch { return luecke("belegspeicher-nicht-verfuegbar"); }
  if (!speicher || !["lesen", "reservieren", "abschliessen"].every(k => typeof speicher[k] === "function")) return luecke("belegspeicher-nicht-verfuegbar");
  let stand;
  const aktuell = await leseAktuellenArtikelstand(doc, opts, { speicher, wiedergewinnung });
  if (aktuell.ergebnis.ok) return aktuell.ergebnis;
  if (aktuell.basis) return (await wiedergewinnung.repariere({ doc, key: aktuell.basis.key,
    stand: aktuell.basis.stand, speicher, pruefe: pruefeBelegstand, now: deps.now, deadlineMs: deps.deadlineMs }))?.ergebnis || aktuell.ergebnis;
  // Bestehende Negative, UNKNOWN und alte fehlende Layoutfolgen erlauben
  // keinen zweiten Originalabruf. Nur ein nie belegter Basisstand darf abrufen.
  if (aktuell.vorhanden || aktuell.stand !== null || aktuell.key !== key) return aktuell.ergebnis;
  // Der alte Eagereinstieg darf denselben Quellenstand nicht erneut abrufen,
  // wenn der globale Lauf bereits einen Einstieg belegt oder versucht hat.
  // Nur ein tatsaechlich fehlender v2-Stand erlaubt den bisherigen v1-Auftrag.
  if (opts.einstiegBestand === true && opts.kontext === undefined) {
    const einstieg = await beschaffeArtikelkontext(doc,
      { versuch: true, nurBestand: true, kontext: "einstieg" }, { ...deps, speicher });
    if (einstieg.ok || einstieg.reason !== "beleg-fehlt") return einstieg;
  }
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
  let result, antwort = null, gelesenAm = null;
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
    antwort = await (deps.fetchUrl || require("./crawler").fetchUrl)(doc.url, 0,
      { ...deps.abruf, env, artikelkontext: true, meldeStatus: true, allowedHost: host.replace(/^www\./, "") });
    // Keine vom Herausgeber oder von JSON LD behauptete Lesezeit uebernehmen.
    gelesenAm = now().toISOString();
    result = (opts.kontext === "einstieg" ? wiedergewinnung.gewinne : G.gewinneArtikelkontext)(doc,
      { ...antwort, gelesenAm },
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
  const speicherMs = require("./verstehen-restzeit").speicherTimeoutMs(env), closingReserve = 2 * speicherMs + 1000;
  const restMs = () => deps.deadlineMs - now().getTime();
  const darfArchivieren = Number.isFinite(deps.deadlineMs) && Number.isFinite(restMs())
    && restMs() >= 20000 + speicherMs + closingReserve + 1000;
  // Cold-IO ist optional. Die bisherige Hauptquittung braucht weiterhin zwei
  // RPCs; selbst ein letzter Cold-RPC mit Timeout darf diese Reserve nicht fressen.
  const archivStart = darfArchivieren && opts.kontext === "einstieg" && !result.ok && W.technisch(result.reason);
  const originalAntwort = archivStart
    ? await wiedergewinnung.sichere({ doc, key, antwort, gelesenAm, speicher, now,
      deadlineMs: deps.deadlineMs - closingReserve }) : null;
  if (archivStart && (!Number.isFinite(restMs()) || restMs() < closingReserve))
    return luecke("abschluss-restzeit-nicht-bestaetigt");
  const end = { ...reservation, ...(originalAntwort ? { version: 2 } : {}),
    zustand: result.ok ? "belegt" : "luecke", abgeschlossenAm: now().toISOString(),
    ...(result.ok ? { beleg: result.beleg } : { reason: result.reason }), ...(originalAntwort ? { originalAntwort } : {}) };
  // Ungueltige Uhr/Ergebnis darf auch im fehlerhaften Adapterfall kein Gruen liefern.
  const checked = pruefeStand(doc, key, end);
  if (checked.reason === "belegstand-ungueltig") return checked;
  try { await speicher.abschliessen(key, reservation.versuchId, end); } catch { /* Ausgang anhand der Ablage pruefen. */ }
  try { stand = await speicher.lesen(key); } catch { return luecke("abschluss-nicht-bestaetigt"); }
  if (!isDeepStrictEqual(stand, end)) return luecke("abschluss-nicht-bestaetigt");
  return pruefeStand(doc, key, stand);
}
module.exports = { beschaffeArtikelkontext, leseArtikelkontext, erzeugeBelegspeicher };
