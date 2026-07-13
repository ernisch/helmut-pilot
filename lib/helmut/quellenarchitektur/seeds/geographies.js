"use strict";

// Helmut — Neue Quellenarchitektur · Seed: Geografie-Hierarchie.
//
// Reine Daten, kein Netz, keine KI. Bildet die langfristig brauchbare geografische
// Struktur ab (Auftrag §12): Deutschland / Bundesland / Bezirk|Landkreis / Kommune.
// Wahlkreis ist bewusst SEPARAT modelliert (electoral_districts), da er keine politische
// Entscheidungsebene ist, sondern Verantwortungsraum.
//
// Politik: ALLE 16 Bundeslaender sind strukturell vorhanden. Tiefere Ebenen werden NICHT
// flaechendeckend gepflegt — nur dort, wo ein aktives Profil/Landesmodul sie braucht:
//   - Berlin (12 Bezirke) + Brandenburg (kreisfreie Staedte + 14 Landkreise) als erste
//     Landesmodule (Auftrag §26/§27).
//   - Niedersachsen (Salzgitter/Braunschweig/Wolfenbuettel) fuer den bestehenden Piloten Cem.
//
// IDs sind stabile Slugs (geo-<level>-<name>), damit spaetere Migrationen/Backfills idempotent bleiben.

const BUND = { id: "geo-bund", level: "bund", name: "Deutschland", parent_id: null };

// Die 16 Bundeslaender (strukturell vollstaendig).
const LAENDER = [
  ["baden-wuerttemberg", "Baden-Württemberg"],
  ["bayern", "Bayern"],
  ["berlin", "Berlin"],
  ["brandenburg", "Brandenburg"],
  ["bremen", "Bremen"],
  ["hamburg", "Hamburg"],
  ["hessen", "Hessen"],
  ["mecklenburg-vorpommern", "Mecklenburg-Vorpommern"],
  ["niedersachsen", "Niedersachsen"],
  ["nordrhein-westfalen", "Nordrhein-Westfalen"],
  ["rheinland-pfalz", "Rheinland-Pfalz"],
  ["saarland", "Saarland"],
  ["sachsen", "Sachsen"],
  ["sachsen-anhalt", "Sachsen-Anhalt"],
  ["schleswig-holstein", "Schleswig-Holstein"],
  ["thueringen", "Thüringen"]
].map(([slug, name]) => ({ id: `geo-land-${slug}`, level: "land", name, parent_id: BUND.id }));

const landId = (slug) => `geo-land-${slug}`;

// Berlin ist Stadtstaat -> Landesebene und Bezirksebene sauber getrennt (Auftrag §26).
// 12 Bezirke.
const BERLIN_BEZIRKE = [
  "Mitte", "Friedrichshain-Kreuzberg", "Pankow", "Charlottenburg-Wilmersdorf",
  "Spandau", "Steglitz-Zehlendorf", "Tempelhof-Schöneberg", "Neukölln",
  "Treptow-Köpenick", "Marzahn-Hellersdorf", "Lichtenberg", "Reinickendorf"
].map((name) => ({
  id: `geo-bezirk-berlin-${slug(name)}`, level: "bezirk", name, parent_id: landId("berlin")
}));

// Brandenburg: 4 kreisfreie Staedte + 14 Landkreise (Grundstruktur, Auftrag §27).
const BB_KREISFREIE = [
  "Potsdam", "Cottbus", "Frankfurt (Oder)", "Brandenburg an der Havel"
].map((name) => ({
  id: `geo-kommune-bb-${slug(name)}`, level: "kommune", name, parent_id: landId("brandenburg")
}));

const BB_LANDKREISE = [
  "Barnim", "Dahme-Spreewald", "Elbe-Elster", "Havelland", "Märkisch-Oderland",
  "Oberhavel", "Oberspreewald-Lausitz", "Oder-Spree", "Ostprignitz-Ruppin",
  "Potsdam-Mittelmark", "Prignitz", "Spree-Neiße", "Teltow-Fläming", "Uckermark"
].map((name) => ({
  id: `geo-kreis-bb-${slug(name)}`, level: "kreis", name, parent_id: landId("brandenburg")
}));

// Niedersachsen-Grundstruktur fuer den bestehenden Piloten (Cem, Region Salzgitter/Braunschweig).
const NDS_REGIONEN = [
  { id: "geo-kommune-nds-salzgitter", level: "kommune", name: "Salzgitter", parent_id: landId("niedersachsen") },
  { id: "geo-kommune-nds-braunschweig", level: "kommune", name: "Braunschweig", parent_id: landId("niedersachsen") },
  { id: "geo-kreis-nds-wolfenbuettel", level: "kreis", name: "Wolfenbüttel", parent_id: landId("niedersachsen") }
];

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const GEOGRAPHIES = [BUND, ...LAENDER, ...BERLIN_BEZIRKE, ...BB_KREISFREIE, ...BB_LANDKREISE, ...NDS_REGIONEN];

// Wahlkreise (electoral_districts) — SEPARATE Struktur, bewusst NICHT flaechendeckend.
// Wird profilgetrieben gefuellt (nur fuer aktive Profile/Landesmodule, Auftrag §12/§24).
// Kein erfundener Wahlkreiszuschnitt: der Seed bleibt leer, bis ein reales Profil ihn braucht.
const ELECTORAL_DISTRICTS = [];

module.exports = { GEOGRAPHIES, ELECTORAL_DISTRICTS, BUND, LAENDER, slugGeo: slug };
