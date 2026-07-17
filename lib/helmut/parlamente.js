"use strict";

// Helmut — Parlaments-Registry (Landtag-Sprint Phase 2, Audit P2-3/P2-5/P2-6).
// =============================================================================================
// EINE zentrale, deterministische Konfiguration je Parlament ersetzt die bisher ueber
// scheduler.js / server.js / ai.js / office.js verstreuten Bundestag-Hardcodes (Persona,
// Funktionsbezeichnung, Regierungsbegriffe, Primaerquelle, Ebenen-Default).
//
// REGRESSIONS-GARANTIE: Alle Bundestag-Werte sind BYTE-IDENTISCH zu den bisherigen
// Hardcodes. Ein Bundestagsprofil (oder ein Profil ohne erkennbare Ebene) erhaelt exakt
// das bisherige Verhalten — die Registry aendert fuer den laufenden Bundestagsbetrieb nichts.
//
// ERWEITERUNG OHNE KERNUMBAU: Ein weiteres Landesparlament ist EIN neuer Eintrag in
// LANDESPARLAMENTE (Daten), keine Logikaenderung. Unbekannte Landtage fallen auf den
// generischen Landtags-Eintrag zurueck (ehrliche, neutrale Labels — nichts erfinden).
//
// REINE LOGIK: kein Netz, kein Storage, kein LLM. Aufloesung ausschliesslich aus
// Profilfeldern (config.parliamentTypeOf + bundesland/state).

const { parliamentTypeOf } = require("./config");

function normBundesland(value) {
  return String(value == null ? "" : value).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z]+/g, " ").trim();
}

// --- Bundestag: Werte = bisherige Hardcodes (byte-identisch, Regressionsschutz) --------------
const BUNDESTAG = Object.freeze({
  key: "bundestag",
  ebene: "bund",
  bundesland: null,
  name: "Deutscher Bundestag",
  mitglied: Object.freeze({
    funktion: "Bundestagsabgeordnete:r",   // scheduler.js neutralProfileDefaults / server.js blankProfile
    funktionM: "Bundestagsabgeordneter",   // server.js normalizeProfile-Fallback
    kurz: "MdB"
  }),
  regierung: Object.freeze({
    name: "Bundesregierung",
    // scheduler.js hasGovernmentWork — EXAKT die bisherige Liste (Reihenfolge egal, Inhalt identisch)
    arbeitsBegriffe: Object.freeze(["bundesregierung", "bmas", "bundeskabinett", "bundestag", "ministerin", "minister"]),
    // ai.js fallbackStatement committee_question — bisheriger Adressat
    frageAdressat: "die Bundesregierung",
    vorhabenLabel: "Bundesregierungsvorhaben"  // ai.js refineBriefingItem Regel
  }),
  persona: Object.freeze({
    // ai.js buildLageBriefingPrompt — EXAKT die bisherigen Saetze
    lageRolle: "Du bist wissenschaftlicher Mitarbeiter eines Mitglieds des Deutschen Bundestages.",
    lageTon: "Sprache eines wissenschaftlichen Mitarbeiters im Bundestag",
    // ai.js assessParliamentaryItem — bisheriger Vorgangs-Bezug
    vorgangsBezug: "offiziellen Bundestags-Vorgang",
    // templates/office/rede.j2 — bisherige Redeart
    redeArt: "Bundestagsrede"
  }),
  relevanz: Object.freeze({
    // scheduler.js itemPoliticalWeight — bisherige politische Schluesselbegriffe (+35)
    politischeBegriffe: Object.freeze(["gesetzentwurf", "gesetz", "eckpunkte", "reform", "initiative", "bundesregierung", "bmas"]),
    // scheduler.js buildRelevantTerms — bisheriger fester Zusatzterm
    basisTerme: Object.freeze(["Bundesregierung"]),
    // scheduler.js lageCheckSourceWeight — bisheriger Strategie-Bonus (unveraendert)
    strategischeQuellenMuster: "bmas|bundesregierung|bundestag|ausschuss|linke|linksfraktion|dgb|tagesschau|deutschlandfunk|person|news-suche",
    // scheduler.js isDecisionRelevantForProfile / itemPoliticalWeight — amtliche Quelltypen
    amtlicheQuelltypen: Object.freeze(["ministry", "bundestag", "committee"])
  }),
  primaerquelle: Object.freeze({ art: "dip" }),
  defaults: Object.freeze({
    politicalLevel: "Bund",
    relevantMinistries: Object.freeze(["Bundesregierung"]),
    monitoringTargets: Object.freeze(["Meine Partei", "Meine Person", "Bundesregierung Vorhaben"])
  })
});

// --- Landesparlamente (Berlin/Brandenburg konkret, Rest generisch) ---------------------------
// Landes-Regierungsarbeit-Begriffe: bewusst BREIT genug fuer Pressetexte (senat, staatskanzlei,
// landesregierung, ministerpraesident, senatorin/senator, ministerin/minister), aber ohne
// Bundesbegriffe — ein Landtagsprofil soll Landes-Regierungsarbeit erkennen, nicht Bund.
const LANDTAG_GENERISCH = Object.freeze({
  key: "landtag",
  ebene: "land",
  bundesland: null,
  name: "Landtag",
  mitglied: Object.freeze({ funktion: "Landtagsabgeordnete:r", funktionM: "Landtagsabgeordneter", kurz: "MdL" }),
  regierung: Object.freeze({
    name: "Landesregierung",
    arbeitsBegriffe: Object.freeze(["landesregierung", "staatskanzlei", "landtag", "ministerpraesident", "ministerpräsident", "landeskabinett", "ministerin", "minister"]),
    frageAdressat: "die Landesregierung",
    vorhabenLabel: "Landesregierungsvorhaben"
  }),
  persona: Object.freeze({
    lageRolle: "Du bist wissenschaftlicher Mitarbeiter eines Mitglieds eines deutschen Landesparlaments.",
    lageTon: "Sprache eines wissenschaftlichen Mitarbeiters im Landtag",
    vorgangsBezug: "offiziellen Landtags-Vorgang",
    redeArt: "Landtagsrede"
  }),
  relevanz: Object.freeze({
    politischeBegriffe: Object.freeze(["gesetzentwurf", "gesetz", "eckpunkte", "reform", "initiative", "landesregierung", "staatskanzlei"]),
    basisTerme: Object.freeze(["Landesregierung", "Landtag"]),
    strategischeQuellenMuster: "landtag|landesregierung|staatskanzlei|ausschuss|fraktion|person|news-suche",
    amtlicheQuelltypen: Object.freeze(["ministry", "bundestag", "committee", "landesparlament", "government", "parliament"])
  }),
  primaerquelle: Object.freeze({ art: "pardok", land: null }),
  defaults: Object.freeze({
    politicalLevel: "Land",
    relevantMinistries: Object.freeze(["Landesregierung"]),
    monitoringTargets: Object.freeze(["Meine Partei", "Meine Person", "Landesregierung Vorhaben"])
  })
});

const LANDESPARLAMENTE = Object.freeze({
  berlin: Object.freeze({
    ...LANDTAG_GENERISCH,
    key: "abgeordnetenhaus-berlin",
    bundesland: "Berlin",
    name: "Abgeordnetenhaus von Berlin",
    mitglied: Object.freeze({ funktion: "Mitglied des Abgeordnetenhauses", funktionM: "Mitglied des Abgeordnetenhauses", kurz: "MdA" }),
    regierung: Object.freeze({
      name: "Senat von Berlin",
      arbeitsBegriffe: Object.freeze(["senat", "senatskanzlei", "senatsverwaltung", "regierender buergermeister", "regierende buergermeisterin", "regierender bürgermeister", "regierende bürgermeisterin", "abgeordnetenhaus", "senatorin", "senator"]),
      frageAdressat: "der Senat von Berlin",
      vorhabenLabel: "Senatsvorhaben"
    }),
    persona: Object.freeze({
      lageRolle: "Du bist wissenschaftlicher Mitarbeiter eines Mitglieds des Abgeordnetenhauses von Berlin.",
      lageTon: "Sprache eines wissenschaftlichen Mitarbeiters im Abgeordnetenhaus von Berlin",
      vorgangsBezug: "offiziellen Vorgang des Abgeordnetenhauses von Berlin",
      redeArt: "Rede im Abgeordnetenhaus von Berlin"
    }),
    relevanz: Object.freeze({
      politischeBegriffe: Object.freeze(["gesetzentwurf", "gesetz", "eckpunkte", "reform", "initiative", "senat", "senatsverwaltung"]),
      basisTerme: Object.freeze(["Senat von Berlin", "Abgeordnetenhaus"]),
      strategischeQuellenMuster: "abgeordnetenhaus|senat|senatskanzlei|senatsverwaltung|berlin|ausschuss|fraktion|person|news-suche",
      amtlicheQuelltypen: LANDTAG_GENERISCH.relevanz.amtlicheQuelltypen
    }),
    primaerquelle: Object.freeze({ art: "pardok", land: "berlin" }),
    defaults: Object.freeze({
      politicalLevel: "Land",
      relevantMinistries: Object.freeze(["Senat von Berlin"]),
      monitoringTargets: Object.freeze(["Meine Partei", "Meine Person", "Senatsvorhaben"])
    })
  }),
  brandenburg: Object.freeze({
    ...LANDTAG_GENERISCH,
    key: "landtag-brandenburg",
    bundesland: "Brandenburg",
    name: "Landtag Brandenburg",
    mitglied: Object.freeze({ funktion: "Landtagsabgeordnete:r", funktionM: "Landtagsabgeordneter", kurz: "MdL" }),
    regierung: Object.freeze({
      name: "Landesregierung Brandenburg",
      arbeitsBegriffe: Object.freeze(["landesregierung", "staatskanzlei", "landtag", "ministerpraesident", "ministerpräsident", "landeskabinett", "ministerin", "minister"]),
      frageAdressat: "die Landesregierung Brandenburg",
      vorhabenLabel: "Landesregierungsvorhaben"
    }),
    persona: Object.freeze({
      lageRolle: "Du bist wissenschaftlicher Mitarbeiter eines Mitglieds des Landtags Brandenburg.",
      lageTon: "Sprache eines wissenschaftlichen Mitarbeiters im Landtag Brandenburg",
      vorgangsBezug: "offiziellen Vorgang des Landtags Brandenburg",
      redeArt: "Landtagsrede"
    }),
    relevanz: Object.freeze({
      politischeBegriffe: Object.freeze(["gesetzentwurf", "gesetz", "eckpunkte", "reform", "initiative", "landesregierung", "staatskanzlei"]),
      basisTerme: Object.freeze(["Landesregierung Brandenburg", "Landtag Brandenburg"]),
      strategischeQuellenMuster: "landtag|landesregierung|staatskanzlei|brandenburg|ausschuss|fraktion|person|news-suche",
      amtlicheQuelltypen: LANDTAG_GENERISCH.relevanz.amtlicheQuelltypen
    }),
    primaerquelle: Object.freeze({ art: "pardok", land: "brandenburg" }),
    defaults: Object.freeze({
      politicalLevel: "Land",
      relevantMinistries: Object.freeze(["Landesregierung Brandenburg"]),
      monitoringTargets: Object.freeze(["Meine Partei", "Meine Person", "Landesregierung Vorhaben"])
    })
  })
});

// --- Aufloesung Profil -> Parlament ----------------------------------------------------------
// Bundestag UND "keine erkennbare Ebene" -> Bundestag-Eintrag (bisheriges Verhalten).
// Landtag -> konkretes Landesparlament (falls modelliert), sonst generischer Landtag.
function resolveParlament(profile = {}) {
  if (parliamentTypeOf(profile) !== "Landtag") return BUNDESTAG;
  const bl = normBundesland(profile.bundesland || profile.state);
  return LANDESPARLAMENTE[bl] || LANDTAG_GENERISCH;
}

// Nutzt ein Mandat DIP (Bundestags-Drucksachen) als amtliche Primaerquelle?
// Bundestag + unbekannte Ebene: JA (bisheriges Verhalten). Landtag: NEIN — dessen
// amtliche Primaerquelle ist der (separat gegatete) PARDOK-Weg.
function usesDip(profile = {}) {
  return resolveParlament(profile).primaerquelle.art === "dip";
}

module.exports = {
  BUNDESTAG,
  LANDTAG_GENERISCH,
  LANDESPARLAMENTE,
  resolveParlament,
  usesDip,
  normBundesland
};
