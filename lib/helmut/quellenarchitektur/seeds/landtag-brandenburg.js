"use strict";

// Helmut — Landtag-Sprint Phase 6 · Vollmodell BRANDENBURG (Landtag, Staatskanzlei, Ministerien,
// Fraktionen, Gruppen, Ausschuesse, Wahlkreise, Behoerden, Medien, Relevanzregeln).
// =============================================================================================
// REINE DATEN + deterministische Generatoren. Kein Netz, kein Storage-Write, KEINE Aktivierung.
//
// DATENSTAND (Web-verifiziert 2026-07-17, Quellen: landtag.brandenburg.de, brandenburg.de,
// wahlergebnisse.brandenburg.de; Details docs/landtag/03-berlin-brandenburg-datenmodell.md):
//   - 8. Wahlperiode (seit Landtagswahl 22.09.2024).
//   - Regierung: Kabinett Woidke V (SPD-CDU) seit 18.03.2026 — Ressortzuschnitt GEAENDERT
//     gegenueber der Regierungsbildung 12/2024 (SPD-BSW): MdFE->MdF (Europa abgegeben),
//     MWAEK->MWEKE (Europa uebernommen, Arbeit abgegeben), MGS->MASGZ (Arbeit +
//     gesellschaftlicher Zusammenhalt uebernommen).
//   - Fraktionen: SPD (34), AfD (30), CDU (12), BSW (9, nach Austritten 11/2025+01/2026)
//     + Gruppe "Wir fuer Brandenburg" (3, anerkannt 03/2026).
//   - Ausschuesse: Hauptausschuss, Petitionsausschuss, Wahlpruefungsausschuss + Fachausschuesse
//     A3-A13 (A7/A8 im WP-Verlauf umbenannt, Ressortneuzuschnitt 2026).
//   - Wahlkreise: alle 44 der Landtagswahl 2024; 41 direkt amtlich belegt
//     (wahlergebnisse.brandenburg.de-Seitentitel), 3 (Nr. 28/34/42) als teilverifiziert
//     markiert — Aktivierungscheckliste verlangt amtliche Nachpruefung vor jedem Prod-Seed.
//
// KOLLISIONSSCHUTZ: Ausschuss-Entitaeten OHNE canonical_key (siehe landtag-berlin.js).

const GEO = "geo-land-brandenburg";

function ent(id, entity_type, name, extra = {}) {
  return { id, entity_type, name, level: "land", geography_id: GEO, aliases: [], ...extra };
}

const BB_PARLAMENT_ID = "parliament-brandenburg-landtag";
const BB_REGIERUNG_ID = "government-brandenburg";

// --- Staendige Ausschuesse des Landtags Brandenburg (8. WP, amtlich verifiziert) --------------
const BRANDENBURG_AUSSCHUESSE = [
  ent("committee-ltbb-haupt", "committee", "Hauptausschuss (Landtag Brandenburg)", { aliases: ["Hauptausschuss Brandenburg", "A1"], verifiziert: true }),
  ent("committee-ltbb-petition", "committee", "Petitionsausschuss (Landtag Brandenburg)", { aliases: ["Petitionsausschuss Brandenburg", "A2"], verifiziert: true }),
  ent("committee-ltbb-wahlpruefung", "committee", "Wahlprüfungsausschuss (Landtag Brandenburg)", { verifiziert: true }),
  ent("committee-ltbb-inneres", "committee", "Ausschuss für Inneres und Kommunales", { aliases: ["A3"], verifiziert: true }),
  ent("committee-ltbb-recht", "committee", "Ausschuss für Recht und Digitalisierung", { aliases: ["A4"], verifiziert: true }),
  ent("committee-ltbb-bildung", "committee", "Ausschuss für Bildung, Jugend und Sport", { aliases: ["A5"], verifiziert: true }),
  ent("committee-ltbb-wissenschaft", "committee", "Ausschuss für Wissenschaft, Forschung und Kultur", { aliases: ["A6"], verifiziert: true }),
  ent("committee-ltbb-soziales", "committee", "Ausschuss für Arbeit, Soziales, Gesundheit und gesellschaftlichen Zusammenhalt", { aliases: ["A7"], verifiziert: true, hinweis: "12/2024 als 'Ausschuss fuer Gesundheit und Soziales' eingesetzt; im WP-Verlauf umbenannt (Ressortneuzuschnitt 2026)." }),
  ent("committee-ltbb-wirtschaft", "committee", "Ausschuss für Wirtschaft, Energie und Klimaschutz", { aliases: ["A8"], verifiziert: true, hinweis: "12/2024 mit 'Arbeit' im Namen eingesetzt; im WP-Verlauf umbenannt." }),
  ent("committee-ltbb-landwirtschaft", "committee", "Ausschuss für Land- und Ernährungswirtschaft, Umwelt und Verbraucherschutz", { aliases: ["A9"], verifiziert: true }),
  ent("committee-ltbb-infrastruktur", "committee", "Ausschuss für Infrastruktur und Landesplanung", { aliases: ["A10"], verifiziert: true }),
  ent("committee-ltbb-haushalt", "committee", "Ausschuss für Haushalt und Finanzen", { aliases: ["A11"], verifiziert: true }),
  ent("committee-ltbb-haushaltskontrolle", "committee", "Ausschuss für Haushaltskontrolle", { aliases: ["A12"], verifiziert: true }),
  ent("committee-ltbb-europa", "committee", "Ausschuss für Europaangelegenheiten und Entwicklungspolitik", { aliases: ["A13"], verifiziert: true })
];

// --- Fraktionen + Gruppen der 8. WP ------------------------------------------------------------
const BRANDENBURG_FRAKTIONEN = [
  ent("group-ltbb-spd", "parliamentary_group", "SPD-Fraktion im Landtag Brandenburg", { aliases: ["SPD-Fraktion Brandenburg"], verifiziert: true }),
  ent("group-ltbb-afd", "parliamentary_group", "AfD-Fraktion im Landtag Brandenburg", { aliases: ["AfD-Fraktion Brandenburg"], verifiziert: true }),
  ent("group-ltbb-cdu", "parliamentary_group", "CDU-Fraktion im Landtag Brandenburg", { aliases: ["CDU-Fraktion Brandenburg"], verifiziert: true }),
  ent("group-ltbb-bsw", "parliamentary_group", "BSW-Fraktion im Landtag Brandenburg", { aliases: ["BSW-Fraktion Brandenburg"], verifiziert: true })
];
const BRANDENBURG_GRUPPEN = [
  ent("group-ltbb-wfb", "parliamentary_group", "Gruppe Wir für Brandenburg im Landtag Brandenburg", { aliases: ["Wir für Brandenburg", "WfB"], verifiziert: true, hinweis: "Gruppe aus 3 Ex-BSW-Abgeordneten, anerkannt 03/2026." })
];

// --- Staatskanzlei + Ministerien (Kabinett Woidke V, Zuschnitt seit 18.03.2026) ----------------
const BRANDENBURG_MINISTERIEN = [
  ent("ministry-bb-stk", "ministry", "Staatskanzlei des Landes Brandenburg", { aliases: ["Staatskanzlei Brandenburg", "StK Brandenburg"], verifiziert: true }),
  ent("ministry-bb-mik", "ministry", "Ministerium des Innern und für Kommunales", { aliases: ["MIK Brandenburg"], verifiziert: true }),
  ent("ministry-bb-mdf", "ministry", "Ministerium der Finanzen", { aliases: ["MdF Brandenburg"], verifiziert: true, hinweis: "Bis 03/2026 'Ministerium der Finanzen und fuer Europa' (MdFE)." }),
  ent("ministry-bb-mdjd", "ministry", "Ministerium der Justiz und für Digitalisierung", { aliases: ["MdJD Brandenburg"], verifiziert: true }),
  ent("ministry-bb-mweke", "ministry", "Ministerium für Wirtschaft, Energie, Klimaschutz und Europa", { aliases: ["MWEKE Brandenburg"], verifiziert: true, hinweis: "Seit 03/2026 (vorher MWAEK: Arbeit abgegeben, Europa uebernommen)." }),
  ent("ministry-bb-masgz", "ministry", "Ministerium für Arbeit, Soziales, Gesundheit und gesellschaftlichen Zusammenhalt", { aliases: ["MASGZ Brandenburg"], verifiziert: true, hinweis: "Seit 03/2026 (vorher MGS)." }),
  ent("ministry-bb-mbjs", "ministry", "Ministerium für Bildung, Jugend und Sport", { aliases: ["MBJS Brandenburg"], verifiziert: true }),
  ent("ministry-bb-mwfk", "ministry", "Ministerium für Wissenschaft, Forschung und Kultur", { aliases: ["MWFK Brandenburg"], verifiziert: true }),
  ent("ministry-bb-mleuv", "ministry", "Ministerium für Land- und Ernährungswirtschaft, Umwelt und Verbraucherschutz", { aliases: ["MLEUV Brandenburg"], verifiziert: true }),
  ent("ministry-bb-mil", "ministry", "Ministerium für Infrastruktur und Landesplanung", { aliases: ["MIL Brandenburg"], verifiziert: true })
];

// --- Relevante Landesbehoerden -----------------------------------------------------------------
const BRANDENBURG_BEHOERDEN = [
  ent("authority-bb-lrh", "authority", "Landesrechnungshof Brandenburg", { aliases: ["LRH Brandenburg"], verifiziert: true }),
  ent("authority-bb-verfg", "authority", "Verfassungsgericht des Landes Brandenburg", { verifiziert: true }),
  ent("authority-bb-lda", "authority", "Landesbeauftragte für den Datenschutz und für das Recht auf Akteneinsicht Brandenburg", { aliases: ["LDA Brandenburg"], verifiziert: true }),
  ent("authority-bb-landeswahlleitung", "authority", "Landeswahlleiterin des Landes Brandenburg", { aliases: ["Landeswahlleitung Brandenburg"], verifiziert: false, hinweis: "Beim MIK angesiedelt; amtliche Eigenbezeichnung vor Prod-Seed pruefen." })
];

// --- Alle 44 Landtagswahlkreise (Landtagswahl 2024) --------------------------------------------
// verifiziert=true: Name woertlich aus amtlichem Seitentitel (wahlergebnisse.brandenburg.de).
// verifiziert=false (Nr. 28/34/42): nur indirekt belegt — vor Prod-Seed amtlich pruefen.
const BRANDENBURG_WAHLKREISNAMEN = [
  [1, "Prignitz I", true], [2, "Prignitz II / Ostprignitz-Ruppin II", true], [3, "Ostprignitz-Ruppin I", true],
  [4, "Ostprignitz-Ruppin III / Havelland III", true], [5, "Havelland I", true], [6, "Havelland II", true],
  [7, "Oberhavel I", true], [8, "Oberhavel II", true], [9, "Oberhavel III", true],
  [10, "Uckermark III / Oberhavel IV", true], [11, "Uckermark I", true], [12, "Uckermark II", true],
  [13, "Barnim I", true], [14, "Barnim II", true], [15, "Barnim III", true],
  [16, "Brandenburg an der Havel I / Potsdam-Mittelmark I", true], [17, "Brandenburg an der Havel II", true],
  [18, "Potsdam-Mittelmark II", true], [19, "Potsdam-Mittelmark III / Potsdam III", true],
  [20, "Potsdam-Mittelmark IV", true], [21, "Potsdam I", true], [22, "Potsdam II", true],
  [23, "Teltow-Fläming I", true], [24, "Teltow-Fläming II", true], [25, "Teltow-Fläming III", true],
  [26, "Dahme-Spreewald I", true], [27, "Dahme-Spreewald II / Oder-Spree I", true],
  [28, "Dahme-Spreewald III", false], [29, "Oder-Spree II", true], [30, "Oder-Spree III", true],
  [31, "Märkisch-Oderland I / Oder-Spree IV", true], [32, "Märkisch-Oderland II", true],
  [33, "Märkisch-Oderland III", true], [34, "Märkisch-Oderland IV", false], [35, "Frankfurt (Oder)", true],
  [36, "Elbe-Elster I", true], [37, "Elbe-Elster II", true], [38, "Oberspreewald-Lausitz I", true],
  [39, "Oberspreewald-Lausitz II / Spree-Neiße IV", true], [40, "Oberspreewald-Lausitz III / Spree-Neiße III", true],
  [41, "Spree-Neiße I", true], [42, "Spree-Neiße II", false], [43, "Cottbus I", true], [44, "Cottbus II", true]
];

function buildBrandenburgWahlkreise() {
  return BRANDENBURG_WAHLKREISNAMEN.map(([nummer, name, verifiziert]) => ({
    id: `wk-ltbb-${nummer}`,
    kind: "landtagswahlkreis",
    number: nummer,
    name,
    geography_id: GEO,
    einteilung: "Landtagswahl 2024 (8. WP)",
    verifiziert
  }));
}

// --- Medienquellen-Kandidaten (Modell; KEINE Abrufwege, keine Aktivierung) ---------------------
const BRANDENBURG_MEDIEN = [
  { name: "Märkische Allgemeine", domain: "maz-online.de", fokus: "Landespolitik Brandenburg (Potsdam/West-BB)", imKandidatenSeed: true },
  { name: "rbb24 (Rundfunk Berlin-Brandenburg)", domain: "rbb24.de", fokus: "OeR-Landesberichterstattung BE+BB", imKandidatenSeed: true },
  { name: "Märkische Oderzeitung", domain: "moz.de", fokus: "Ost-Brandenburg", imKandidatenSeed: false },
  { name: "Lausitzer Rundschau", domain: "lr-online.de", fokus: "Sued-Brandenburg/Lausitz", imKandidatenSeed: false },
  { name: "Potsdamer Neueste Nachrichten", domain: "pnn.de", fokus: "Potsdam (Tagesspiegel-Verbund)", imKandidatenSeed: false },
  { name: "Nordkurier", domain: "nordkurier.de", fokus: "Uckermark/Nord-BB (Randabdeckung)", imKandidatenSeed: false }
];

// --- Relevanzregeln Brandenburg -----------------------------------------------------------------
const BRANDENBURG_RELEVANZ = {
  regierungsBegriffe: ["landesregierung", "staatskanzlei", "ministerpraesident", "ministerpräsident", "landeskabinett", "kabinett woidke"],
  parlamentsBegriffe: ["landtag brandenburg", "plenarsitzung landtag", "drucksache", "mdl"],
  ministerienKurz: BRANDENBURG_MINISTERIEN.flatMap((m) => m.aliases || []),
  behoerden: BRANDENBURG_BEHOERDEN.map((b) => b.name)
};

const BRANDENBURG_MODELL = {
  land: "brandenburg",
  parlamentId: BB_PARLAMENT_ID,
  regierungId: BB_REGIERUNG_ID,
  ausschuesse: BRANDENBURG_AUSSCHUESSE,
  fraktionen: BRANDENBURG_FRAKTIONEN,
  gruppen: BRANDENBURG_GRUPPEN,
  ministerien: BRANDENBURG_MINISTERIEN,
  behoerden: BRANDENBURG_BEHOERDEN,
  wahlkreise: buildBrandenburgWahlkreise(),
  medien: BRANDENBURG_MEDIEN,
  relevanz: BRANDENBURG_RELEVANZ
};

module.exports = {
  BRANDENBURG_MODELL,
  BRANDENBURG_AUSSCHUESSE,
  BRANDENBURG_FRAKTIONEN,
  BRANDENBURG_GRUPPEN,
  BRANDENBURG_MINISTERIEN,
  BRANDENBURG_BEHOERDEN,
  BRANDENBURG_WAHLKREISNAMEN,
  buildBrandenburgWahlkreise,
  BRANDENBURG_MEDIEN,
  BRANDENBURG_RELEVANZ
};
