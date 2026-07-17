"use strict";

// Helmut — Landtag-Sprint Phase 5 · Vollmodell BERLIN (Abgeordnetenhaus, Senat, Fraktionen,
// Ausschuesse, Wahlkreise, Behoerden, Medien, Relevanzregeln).
// =============================================================================================
// REINE DATEN + deterministische Generatoren. Kein Netz, kein Storage-Write, KEINE Aktivierung:
// alles hier ist Modell-/Seed-Material (prepared). Das Anwenden auf Production bleibt ein
// eigener, ausdruecklich freigabepflichtiger Schritt.
//
// DATENSTAND (Web-verifiziert 2026-07-17, Quellen: parlament-berlin.de, berlin.de,
// wahlen-berlin.de; Details docs/landtag/03-berlin-brandenburg-datenmodell.md):
//   - Ausschuesse: 19. Wahlperiode (nach Wiederholungswahl 2023), 18 staendige Ausschuesse.
//   - Senat: Senatskanzlei + 10 Senatsverwaltungen (Zuschnitt seit 2023).
//   - Fraktionen: CDU, SPD, Gruene, Linke, AfD (19. WP).
//   - Wahlkreise: 78, Namensschema "<Bezirk> <Nr>"; Verteilung je Bezirk nach dem
//     Senatsbeschluss vom 03.06.2025 fuer die Abgeordnetenhauswahl 2026 (Pankow 9;
//     Mitte/ChW/StZ/TS/TK je 7; Neukoelln/MaHe/Li/Rei je 6; Spandau/FK je 5).
//     Fuer die laufende 19. WP galt: Friedrichshain-Kreuzberg 6, Treptow-Koepenick 6.
//   - verifiziert=false markiert Eintraege ohne direkten amtlichen Beleg (Aktivierungs-
//     checkliste verlangt Nachpruefung vor jedem Prod-Seed).
//
// KOLLISIONSSCHUTZ: Ausschuss-Entitaeten tragen KEIN canonical_key (nur exakte Namen/Aliase)
// — der ENTITY_BY_KEY-Index der Klassifikation (committee:<key>) bleibt exklusiv fuer die
// kuratierten Bundestags-Ausschuesse; ein AGH-"Inneres" kann den BT-Schluessel nicht
// ueberschreiben. Parteien-Landesverbaende existieren bereits (20260717-Seed).

const GEO = "geo-land-berlin";

function ent(id, entity_type, name, extra = {}) {
  return { id, entity_type, name, level: "land", geography_id: GEO, aliases: [], ...extra };
}

// --- Parlament & Regierung (Kern-Entitaeten existieren bereits im 20260713/17-Seed) ----------
const BERLIN_PARLAMENT_ID = "parliament-berlin-agh";
const BERLIN_REGIERUNG_ID = "government-berlin-senat";

// --- Staendige Ausschuesse des Abgeordnetenhauses (19. WP, alle amtlich verifiziert) ----------
const BERLIN_AUSSCHUESSE = [
  ent("committee-agh-haupt", "committee", "Hauptausschuss (Abgeordnetenhaus von Berlin)", { aliases: ["Hauptausschuss Berlin"], verifiziert: true }),
  ent("committee-agh-petition", "committee", "Petitionsausschuss (Abgeordnetenhaus von Berlin)", { aliases: ["Petitionsausschuss Berlin"], verifiziert: true }),
  ent("committee-agh-recht", "committee", "Ausschuss für Verfassungs- und Rechtsangelegenheiten, Geschäftsordnung, Verbraucherschutz", { verifiziert: true }),
  ent("committee-agh-inneres", "committee", "Ausschuss für Inneres, Sicherheit und Ordnung", { verifiziert: true }),
  ent("committee-agh-verfassungsschutz", "committee", "Ausschuss für Verfassungsschutz", { verifiziert: true }),
  ent("committee-agh-arbeit-soziales", "committee", "Ausschuss für Arbeit und Soziales", { aliases: ["Ausschuss für Arbeit und Soziales (Berlin)"], verifiziert: true }),
  ent("committee-agh-bildung", "committee", "Ausschuss für Bildung, Jugend und Familie", { verifiziert: true }),
  ent("committee-agh-bund-europa", "committee", "Ausschuss für Bundes- und Europaangelegenheiten, Medien", { verifiziert: true }),
  ent("committee-agh-digital", "committee", "Ausschuss für Digitalisierung und Datenschutz", { verifiziert: true }),
  ent("committee-agh-gesundheit", "committee", "Ausschuss für Gesundheit und Pflege", { verifiziert: true }),
  ent("committee-agh-integration", "committee", "Ausschuss für Integration, Frauen und Gleichstellung, Vielfalt und Antidiskriminierung", { verifiziert: true }),
  ent("committee-agh-kultur", "committee", "Ausschuss für Kultur, Engagement und Demokratieförderung", { verifiziert: true }),
  ent("committee-agh-mobilitaet", "committee", "Ausschuss für Mobilität und Verkehr", { verifiziert: true }),
  ent("committee-agh-sport", "committee", "Ausschuss für Sport", { aliases: ["Sportausschuss Berlin"], verifiziert: true }),
  ent("committee-agh-stadtentwicklung", "committee", "Ausschuss für Stadtentwicklung, Bauen und Wohnen", { verifiziert: true }),
  ent("committee-agh-umwelt", "committee", "Ausschuss für Umwelt- und Klimaschutz", { verifiziert: true }),
  ent("committee-agh-wirtschaft", "committee", "Ausschuss für Wirtschaft, Energie und Betriebe", { verifiziert: true }),
  ent("committee-agh-wissenschaft", "committee", "Ausschuss für Wissenschaft und Forschung", { verifiziert: true })
];

// --- Fraktionen der 19. WP (group-agh-linke existiert bereits im 20260717-Seed) ---------------
const BERLIN_FRAKTIONEN = [
  ent("group-agh-cdu", "parliamentary_group", "CDU-Fraktion im Abgeordnetenhaus von Berlin", { aliases: ["CDU-Fraktion Berlin"], verifiziert: true }),
  ent("group-agh-spd", "parliamentary_group", "SPD-Fraktion im Abgeordnetenhaus von Berlin", { aliases: ["SPD-Fraktion Berlin"], verifiziert: true }),
  ent("group-agh-gruene", "parliamentary_group", "Fraktion Bündnis 90/Die Grünen im Abgeordnetenhaus von Berlin", { aliases: ["Grüne Fraktion Berlin"], verifiziert: true }),
  ent("group-agh-afd", "parliamentary_group", "AfD-Fraktion im Abgeordnetenhaus von Berlin", { aliases: ["AfD-Fraktion Berlin"], verifiziert: true })
  // group-agh-linke: bereits vorhanden (seeds/landesmodule-quellen.js / 20260717-Seed).
];

// --- Senatskanzlei + Senatsverwaltungen (Zuschnitt seit 2023, amtlich verifiziert) ------------
const BERLIN_SENATSVERWALTUNGEN = [
  ent("ministry-be-senatskanzlei", "ministry", "Senatskanzlei Berlin", { aliases: ["Der Regierende Bürgermeister von Berlin – Senatskanzlei", "Senatskanzlei"], verifiziert: true }),
  ent("ministry-be-asgiva", "ministry", "Senatsverwaltung für Arbeit, Soziales, Gleichstellung, Integration, Vielfalt und Antidiskriminierung", { aliases: ["SenASGIVA"], verifiziert: true }),
  ent("ministry-be-bjf", "ministry", "Senatsverwaltung für Bildung, Jugend und Familie", { aliases: ["SenBJF"], verifiziert: true }),
  ent("ministry-be-fin", "ministry", "Senatsverwaltung für Finanzen", { aliases: ["SenFin"], verifiziert: true }),
  ent("ministry-be-inn", "ministry", "Senatsverwaltung für Inneres und Sport", { aliases: ["SenInnSport"], verifiziert: true }),
  ent("ministry-be-just", "ministry", "Senatsverwaltung für Justiz und Verbraucherschutz", { aliases: ["SenJustV"], verifiziert: true }),
  ent("ministry-be-kult", "ministry", "Senatsverwaltung für Kultur und Gesellschaftlichen Zusammenhalt", { aliases: ["SenKultGZ"], verifiziert: true }),
  ent("ministry-be-mvku", "ministry", "Senatsverwaltung für Mobilität, Verkehr, Klimaschutz und Umwelt", { aliases: ["SenMVKU"], verifiziert: true }),
  ent("ministry-be-stadt", "ministry", "Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen", { aliases: ["SenStadt"], verifiziert: true }),
  ent("ministry-be-web", "ministry", "Senatsverwaltung für Wirtschaft, Energie und Betriebe", { aliases: ["SenWEB"], verifiziert: true }),
  ent("ministry-be-wgp", "ministry", "Senatsverwaltung für Wissenschaft, Gesundheit und Pflege", { aliases: ["SenWGP"], verifiziert: true })
];

// --- Relevante Landesbehoerden (statoffice-berlin-brandenburg existiert bereits) --------------
const BERLIN_BEHOERDEN = [
  ent("authority-be-rechnungshof", "authority", "Rechnungshof von Berlin", { verifiziert: true }),
  ent("authority-be-datenschutz", "authority", "Berliner Beauftragte für Datenschutz und Informationsfreiheit", { aliases: ["BlnBDI"], verifiziert: true }),
  ent("authority-be-landeswahlleitung", "authority", "Landeswahlleiterin für Berlin", { aliases: ["Landeswahlleitung Berlin"], verifiziert: true })
];

// --- Wahlkreise: 78, Namensschema "<Bezirk> <Nr>" ---------------------------------------------
// Verteilung nach Senatsbeschluss 03.06.2025 (Abgeordnetenhauswahl 2026, amtlich verifiziert).
const BERLIN_WAHLKREISVERTEILUNG_2026 = Object.freeze({
  "Mitte": 7, "Friedrichshain-Kreuzberg": 5, "Pankow": 9, "Charlottenburg-Wilmersdorf": 7,
  "Spandau": 5, "Steglitz-Zehlendorf": 7, "Tempelhof-Schöneberg": 7, "Neukölln": 6,
  "Treptow-Köpenick": 7, "Marzahn-Hellersdorf": 6, "Lichtenberg": 6, "Reinickendorf": 6
});

function slugBezirk(b) {
  return b.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-");
}

// Erzeugt die 78 AGH-Wahlkreise als electoral_districts-Zeilen (kind 'landtagswahlkreis' —
// das DB-Enum kennt bewusst nur bundestagswahlkreis/landtagswahlkreis; AGH-Wahlkreise sind
// Landesparlamentswahlkreise). Deterministisch, Summe wird im Test erzwungen.
function buildBerlinWahlkreise() {
  const out = [];
  for (const [bezirk, anzahl] of Object.entries(BERLIN_WAHLKREISVERTEILUNG_2026)) {
    for (let n = 1; n <= anzahl; n += 1) {
      out.push({
        id: `wk-agh-${slugBezirk(bezirk)}-${n}`,
        kind: "landtagswahlkreis",
        number: n,
        name: `${bezirk} ${n}`,
        geography_id: GEO,
        einteilung: "AGH 2026 (Senatsbeschluss 03.06.2025)",
        verifiziert: true
      });
    }
  }
  return out;
}

// --- Medienquellen-Kandidaten (Modell; KEINE Abrufwege, keine Aktivierung) --------------------
// Abrufwege entstehen erst nach technischer Quellenpruefung (Muster: landesmodule-kandidaten).
const BERLIN_MEDIEN = [
  { name: "Der Tagesspiegel", domain: "tagesspiegel.de", fokus: "Landespolitik Berlin (Checkpoint/Landespolitik-Ressort)", imKandidatenSeed: true },
  { name: "rbb24 (Rundfunk Berlin-Brandenburg)", domain: "rbb24.de", fokus: "OeR-Landesberichterstattung BE+BB", imKandidatenSeed: true },
  { name: "Berliner Zeitung", domain: "berliner-zeitung.de", fokus: "Landespolitik Berlin", imKandidatenSeed: false },
  { name: "Berliner Morgenpost", domain: "morgenpost.de", fokus: "Landespolitik Berlin", imKandidatenSeed: false },
  { name: "B.Z.", domain: "bz-berlin.de", fokus: "Boulevard/Landespolitik Berlin", imKandidatenSeed: false },
  { name: "taz (Berlin-Ressort)", domain: "taz.de", fokus: "Landespolitik Berlin", imKandidatenSeed: false }
];

// --- Relevanzregeln Berlin (konfigurierbare Kataloge, konsumiert ueber parlamente.js) ---------
// Ergaenzen die Registry-Begriffe um Institutionen-Kurzformen und amtliche Namen.
const BERLIN_RELEVANZ = {
  regierungsBegriffe: ["senat", "senatskanzlei", "senatsverwaltung", "regierender buergermeister", "regierende buergermeisterin", "senatorin", "senator"],
  parlamentsBegriffe: ["abgeordnetenhaus", "plenarsitzung abgeordnetenhaus", "drucksache", "mda"],
  ministerienKurz: BERLIN_SENATSVERWALTUNGEN.flatMap((m) => m.aliases || []),
  behoerden: BERLIN_BEHOERDEN.map((b) => b.name)
};

const BERLIN_MODELL = {
  land: "berlin",
  parlamentId: BERLIN_PARLAMENT_ID,
  regierungId: BERLIN_REGIERUNG_ID,
  ausschuesse: BERLIN_AUSSCHUESSE,
  fraktionen: BERLIN_FRAKTIONEN,
  verwaltungen: BERLIN_SENATSVERWALTUNGEN,
  behoerden: BERLIN_BEHOERDEN,
  wahlkreise: buildBerlinWahlkreise(),
  medien: BERLIN_MEDIEN,
  relevanz: BERLIN_RELEVANZ
};

module.exports = {
  BERLIN_MODELL,
  BERLIN_AUSSCHUESSE,
  BERLIN_FRAKTIONEN,
  BERLIN_SENATSVERWALTUNGEN,
  BERLIN_BEHOERDEN,
  BERLIN_WAHLKREISVERTEILUNG_2026,
  buildBerlinWahlkreise,
  BERLIN_MEDIEN,
  BERLIN_RELEVANZ
};
