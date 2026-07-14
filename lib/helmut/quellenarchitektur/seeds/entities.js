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

const { normalizeParty, normalizeCommittee } = require("../../matching");

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
const FRACTIONS = [
  ["group-bt-cdu-csu", "CDU/CSU-Bundestagsfraktion", "cdu"],
  ["group-bt-spd", "SPD-Bundestagsfraktion", "spd"],
  ["group-bt-gruene", "Fraktion Bündnis 90/Die Grünen", "gruene"],
  ["group-bt-linke", "Gruppe Die Linke im Bundestag", "linke"],
  ["group-bt-afd", "AfD-Bundestagsfraktion", "afd"],
  ["group-bt-fdp", "FDP-Bundestagsfraktion", "fdp"],
  ["group-bt-bsw", "Gruppe BSW", "bsw"],
  ["group-bt-ssw", "SSW im Bundestag", "ssw"]
].map(([id, name, key]) => e(id, "parliamentary_group", name, {
  canonical_key: key, level: "bund", geography_id: "geo-bund"
}));

// --- Bundestagsausschuesse (committee), 23 Fachausschuesse ------------------
// Stabile, eindeutige Kuerzel (konsistent mit sources.js committee-* IDs). canonical_key
// bleibt matching.js-kompatibel (normalizeCommittee) — dieser darf mehrdeutig sein, die ID nicht.
const COMMITTEES = [
  ["arbeit-soziales", "Arbeit und Soziales"], ["gesundheit", "Gesundheit"],
  ["verteidigung", "Verteidigung"], ["auswaertiges", "Auswärtiges"], ["inneres", "Inneres und Heimat"],
  ["recht", "Recht"], ["finanzen", "Finanzen"], ["haushalt", "Haushalt"],
  ["wirtschaft", "Wirtschaft und Energie"], ["klima-umwelt", "Klima und Umwelt"],
  ["landwirtschaft", "Ernährung und Landwirtschaft"], ["familie", "Familie, Senioren, Frauen und Jugend"],
  ["bildung", "Bildung und Forschung"], ["verkehr", "Verkehr"], ["digitales", "Digitales"],
  ["bau-wohnen", "Bauen und Wohnen"], ["menschenrechte", "Menschenrechte und humanitäre Hilfe"],
  ["kultur-medien", "Kultur und Medien"], ["entwicklung", "Wirtschaftliche Zusammenarbeit und Entwicklung"],
  ["europa", "Europäische Union"], ["tourismus", "Tourismus"], ["sport", "Sport"], ["petitionen", "Petitionen"]
].map(([kuerzel, name]) => e(`committee-bt-${kuerzel}`, "committee", `Ausschuss für ${name}`, {
  // canonical_key bleibt matching.js-kompatibel (normalizeCommittee) — außer beim
  // Menschenrechtsausschuss, dessen normalizeCommittee fälschlich "recht" ergäbe
  // (Kollision mit dem Rechtsausschuss). Eindeutiger Schlüssel für den Resolver.
  canonical_key: kuerzel === "menschenrechte" ? "menschenrechte" : normalizeCommittee(name),
  level: "bund", geography_id: "geo-bund"
}));

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
  PARTIES, FRACTIONS, COMMITTEES, MINISTRIES, PARLIAMENTS, GOVERNMENTS, ASSOCIATIONS, AUTHORITIES
};
