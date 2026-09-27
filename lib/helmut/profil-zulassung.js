"use strict";

// Betreiberregel 27.09.2026: keine AfD-Kunden/Testzielprofile, auf jeder Ebene.
// Nur aktuelle strukturierte Zugehoerigkeit lesen. Nachrichten, Gegner, Themen
// und fruehere Rollen sind KEINE Kunden-Zugehoerigkeit und werden nicht gefiltert.
const GRUND = "AfD-zugehoerige Profile sind von Helmut ausgeschlossen.";

function afdZugehoerigkeit(value) {
  if (Array.isArray(value)) return value.some(afdZugehoerigkeit);
  const s = String(value == null ? "" : value).toLowerCase()
    .replace(/ü/g, "ue").replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^(?:fraktion|bundestagsfraktion|landtagsfraktion)(?: der)? /, "");
  // Auch widerspruechliche/mehrteilige aktuelle Angaben nicht als Zulassung
  // behandeln. Historie gehoert in Rollen/Notizen, nicht in Partei/Fraktion.
  return /(?:^| )(?:afd|alternative fuer deutschland)(?: |$)/.test(s);
}

function istAusgeschlossen(profile = {}) {
  profile = profile || {};
  return [profile.party, profile.partei, profile.faction, profile.fraktion]
    .some(afdZugehoerigkeit);
}

function fordereZulassung(profile) {
  if (!istAusgeschlossen(profile)) return;
  const error = new Error(GRUND);
  error.code = "profil-zielgruppe-ausgeschlossen";
  error.statusCode = 403;
  throw error;
}

module.exports = { GRUND, afdZugehoerigkeit, istAusgeschlossen, fordereZulassung };
