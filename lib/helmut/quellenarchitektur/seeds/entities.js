"use strict";

// Helmut — Neue Quellenarchitektur · Seed: zentrale politische Entitaeten (typisiert).
//
// Reine Daten. Eine EINZIGE typisierte Entitaetsschicht (Auftrag §13) statt je eigener
// harter Quellenarchitektur pro Partei/Ausschuss/Ministerium. canonical_key nutzt dieselbe
// Normalisierung wie matching.js (normalizeParty/normalizeCommittee), damit Profil- und
// KO-Erwaehnungen spaeter kollisionsfrei auf dieselbe Entitaet aufloesen.
//
// Umfang: die Entitaeten, die real im Katalog (v1Sources) oder in Profilen vorkommen, plus
// die Landesmodul-Kern-Entitaeten fuer Berlin/Brandenburg (Parlament/Regierung). Es werden
// KEINE spekulativen Detaildaten erfunden (z. B. keine erfundene Landesfraktionsliste — die
// folgt in Sprint 9 aus der technischen Quellenpruefung).

const { normalizeParty, committeeMatchKey } = require("../../matching");

function e(id, entity_type, name, extra = {}) {
  return {
    id, entity_type, name,
    canonical_key: extra.canonical_key || null,
    level: extra.level || null,
    geography_id: extra.geography_id || null,
    aliases: extra.aliases || []
  };
}

// --- Parteien (party) -------------------------------------------------------
const PARTIES = [
  ["party-cdu", "CDU", ["CDU", "Christlich Demokratische Union"]],
  ["party-csu", "CSU", ["CSU", "Christlich-Soziale Union"]],
  ["party-spd", "SPD", ["SPD", "Sozialdemokratische Partei Deutschlands"]],
  ["party-gruene", "Bündnis 90/Die Grünen", ["Grüne", "Bündnis 90/Die Grünen", "Die Grünen"]],
  ["party-fdp", "FDP", ["FDP", "Freie Demokraten"]],
  ["party-afd", "AfD", ["AfD", "Alternative für Deutschland"]],
  ["party-linke", "Die Linke", ["Die Linke", "Linke", "DIE LINKE"]],
  ["party-bsw", "BSW", ["BSW", "Bündnis Sahra Wagenknecht"]],
  ["party-ssw", "SSW", ["SSW", "Südschleswigscher Wählerverband"]]
].map(([id, name, aliases]) => e(id, "party", name, { canonical_key: normalizeParty(name), aliases }));

// --- Bundestagsfraktionen (parliamentary_group) -----------------------------
const { BUNDESTAG_21 } = require("./parlamentszusammensetzung");
const { STAENDIGE_AUSSCHUESSE } = require("./bundestag-ausschuesse");
const { FACHZUORDNUNG } = require("./fach-parteiquellen");
const FRACTIONS = BUNDESTAG_21.fraktionen.map((f) => e(`group-bt-${f.key}`, "parliamentary_group", `${f.name}-Bundestagsfraktion`, {
  canonical_key: f.key === "cdu-csu" ? "union" : f.key, level: "bund", geography_id: "geo-bund",
  aliases: [`Fraktion ${f.name}`, `${f.name}-Bundestagsfraktion`]
}));

// Historische Fraktionen sind keine aktuellen Akteure. Die IDs bleiben als
// Nachschlagehilfe erhalten, gelangen aber nicht in das aktuelle Entitätsmatching.
const HISTORICAL_FRACTIONS = [
  { id: "group-bt-fdp", name: "FDP-Bundestagsfraktion", wahlperiode: 20 },
  { id: "group-bt-bsw", name: "Gruppe BSW", wahlperiode: 20 },
  { id: "group-bt-linke", name: "Gruppe Die Linke im Bundestag", wahlperiode: 20 }
];

// Stabile IDs behalten; aktuelle Bezeichnung und Vollzähligkeit aus der amtlichen
// Sollmenge. Ein einzelner fraktionsloser Abgeordneter wird nicht zur Fraktion.
const COMMITTEES = STAENDIGE_AUSSCHUESSE.map((a) => {
  const [matchKey, legacySuffix, topics] = FACHZUORDNUNG[a.key];
  return e(`committee-bt-${legacySuffix || "arbeit-soziales"}`, "committee", a.name, {
    canonical_key: committeeMatchKey(a.name), level: "bund", geography_id: "geo-bund",
    aliases: [a.key, matchKey, ...topics.filter((t) => t === "Forschung" || t === "Bildung")]
  });
});

// --- Ministerien (ministry) -------------------------------------------------
const MINISTRIES = [
  ["ministry-bmas", "Bundesministerium für Arbeit und Soziales", ["BMAS"]],
  ["ministry-bmg", "Bundesministerium für Gesundheit", ["BMG"]],
  ["ministry-bmf", "Bundesministerium der Finanzen", ["BMF"]],
  ["ministry-bmfsfj", "Bundesministerium für Familie, Senioren, Frauen und Jugend", ["BMFSFJ"]],
  ["ministry-bmi", "Bundesministerium des Innern", ["BMI"]],
  ["ministry-auswaertiges-amt", "Auswärtiges Amt", ["AA"]]
].map(([id, name, aliases]) => e(id, "ministry", name, { level: "bund", geography_id: "geo-bund", aliases }));

// --- Parlamente (parliament) ------------------------------------------------
const PARLIAMENTS = [
  e("parliament-bundestag", "parliament", "Deutscher Bundestag", { level: "bund", geography_id: "geo-bund", aliases: ["Bundestag"] }),
  e("parliament-bundesrat", "parliament", "Bundesrat", { level: "bund", geography_id: "geo-bund" }),
  // Landesmodule Berlin/Brandenburg (Struktur vorbereitet, Quellen folgen in Sprint 9):
  e("parliament-berlin-agh", "parliament", "Abgeordnetenhaus von Berlin", { level: "land", geography_id: "geo-land-berlin" }),
  e("parliament-brandenburg-landtag", "parliament", "Landtag Brandenburg", { level: "land", geography_id: "geo-land-brandenburg" })
];

// --- Regierungen (government) -----------------------------------------------
const GOVERNMENTS = [
  e("government-bund", "government", "Bundesregierung", { level: "bund", geography_id: "geo-bund", aliases: ["Bundeskabinett", "Bundeskanzleramt"] }),
  e("government-berlin-senat", "government", "Senat von Berlin", { level: "land", geography_id: "geo-land-berlin", aliases: ["Berliner Senat", "Senatskanzlei"] }),
  e("government-brandenburg", "government", "Landesregierung Brandenburg", { level: "land", geography_id: "geo-land-brandenburg", aliases: ["Staatskanzlei Brandenburg"] })
];

// --- Verbaende & Gewerkschaften (association / union) -----------------------
const ASSOCIATIONS = [
  e("union-dgb", "union", "Deutscher Gewerkschaftsbund", { aliases: ["DGB"] }),
  e("union-verdi", "union", "ver.di", { aliases: ["ver.di", "Vereinte Dienstleistungsgewerkschaft"] }),
  e("union-ig-metall", "union", "IG Metall", { aliases: ["IG Metall"] }),
  e("association-vdk", "association", "Sozialverband VdK", { aliases: ["VdK"] }),
  e("association-sovd", "association", "Sozialverband Deutschland", { aliases: ["SoVD"] }),
  e("association-paritaetischer", "association", "Der Paritätische Gesamtverband", { aliases: ["Der Paritätische"] }),
  e("association-caritas", "association", "Deutscher Caritasverband", { aliases: ["Caritas"] }),
  e("association-diakonie", "association", "Diakonie Deutschland", { aliases: ["Diakonie"] }),
  e("association-bda", "association", "Bundesvereinigung der Deutschen Arbeitgeberverbände", { aliases: ["BDA"] }),
  e("association-bdi", "association", "Bundesverband der Deutschen Industrie", { aliases: ["BDI"] }),
  e("association-zdh", "association", "Zentralverband des Deutschen Handwerks", { aliases: ["ZDH"] })
];

// --- Behoerden & Statistik (authority / statistical_office) -----------------
const AUTHORITIES = [
  e("authority-bundesagentur-arbeit", "authority", "Bundesagentur für Arbeit", { level: "bund", geography_id: "geo-bund", aliases: ["BA", "Arbeitsagentur"] }),
  e("statoffice-destatis", "statistical_office", "Statistisches Bundesamt", { level: "bund", geography_id: "geo-bund", aliases: ["Destatis"] }),
  e("authority-drv", "authority", "Deutsche Rentenversicherung", { level: "bund", geography_id: "geo-bund" }),
  e("authority-bundesrechnungshof", "authority", "Bundesrechnungshof", { level: "bund", geography_id: "geo-bund" }),
  // Statistik-Landesamt fuer die Landesmodule Berlin/Brandenburg (gemeinsames Amt):
  e("statoffice-berlin-brandenburg", "statistical_office", "Amt für Statistik Berlin-Brandenburg", { level: "land", geography_id: "geo-land-berlin" })
];

const POLITICAL_ENTITIES = [
  ...PARTIES, ...FRACTIONS, ...COMMITTEES, ...MINISTRIES,
  ...PARLIAMENTS, ...GOVERNMENTS, ...ASSOCIATIONS, ...AUTHORITIES
];

module.exports = {
  POLITICAL_ENTITIES,
  PARTIES, FRACTIONS, HISTORICAL_FRACTIONS, COMMITTEES, MINISTRIES, PARLIAMENTS, GOVERNMENTS, ASSOCIATIONS, AUTHORITIES
};
