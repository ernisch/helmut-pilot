"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Seed: ergaenzende Entitaeten (ADDITIV).
//
// Reine Daten. Ergaenzt die bestehende Entitaetsschicht (../../seeds/entities.js) um die fuer
// den repraesentativen Startkatalog (Phase 6) benoetigten, im Basis-Seed noch fehlenden
// Entitaeten — OHNE die Bestandsdatei zu veraendern (bestehende Tests bleiben gruen). Bestehende
// Entitaets-IDs werden referenziert, NICHT dupliziert.
//
// Belegbarkeit (Phase 6): jede Ministeriums-/Gerichts-/Portal-Entitaet traegt ihre stabile,
// oeffentlich bekannte Domain. Die 2025 umbenannten Ressorts (Wirtschaft/Energie -> BMWE,
// Domain bundeswirtschaftsministerium.de) sind per Web-Recherche verifiziert; die uebrigen
// Domains sind langjaehrig stabil. Genaue Ressortzuschnitte des Kabinetts Merz I sind im
// Bericht als "technisch zu verifizieren" gekennzeichnet (Prüfstatus < aktiv).

function e(id, entity_type, name, extra = {}) {
  return {
    id, entity_type, name,
    canonical_key: extra.canonical_key || null,
    level: extra.level || null,
    geography_id: extra.geography_id || null,
    aliases: extra.aliases || [],
    domain: extra.domain || null // Convenience fuer den Seed (nicht Teil des DB-Schemas)
  };
}

// --- Ergaenzende Bundesministerien (Basis-Seed hat nur bmas/bmg/bmf/bmfsfj/bmi/auswaertiges) --
const MINISTRIES_EXTRA = [
  e("ministry-bmwe", "ministry", "Bundesministerium für Wirtschaft und Energie", { level: "bund", geography_id: "geo-bund", aliases: ["BMWE", "Wirtschaftsministerium"], domain: "bundeswirtschaftsministerium.de" }),
  e("ministry-bmuv", "ministry", "Bundesministerium für Umwelt, Naturschutz und nukleare Sicherheit", { level: "bund", geography_id: "geo-bund", aliases: ["BMUV", "Umweltministerium"], domain: "bmuv.de" }),
  e("ministry-bmbf", "ministry", "Bundesministerium für Bildung und Forschung", { level: "bund", geography_id: "geo-bund", aliases: ["BMBF"], domain: "bmbf.de" }),
  e("ministry-bmvg", "ministry", "Bundesministerium der Verteidigung", { level: "bund", geography_id: "geo-bund", aliases: ["BMVg", "Verteidigungsministerium"], domain: "bmvg.de" }),
  e("ministry-bmel", "ministry", "Bundesministerium für Ernährung und Landwirtschaft", { level: "bund", geography_id: "geo-bund", aliases: ["BMEL"], domain: "bmel.de" }),
  e("ministry-bmz", "ministry", "Bundesministerium für wirtschaftliche Zusammenarbeit und Entwicklung", { level: "bund", geography_id: "geo-bund", aliases: ["BMZ"], domain: "bmz.de" }),
  e("ministry-bmv", "ministry", "Bundesministerium für Verkehr", { level: "bund", geography_id: "geo-bund", aliases: ["BMV", "BMDV", "Verkehrsministerium"], domain: "bmdv.bund.de" }),
  e("ministry-bmwsb", "ministry", "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen", { level: "bund", geography_id: "geo-bund", aliases: ["BMWSB"], domain: "bmwsb.bund.de" }),
  e("ministry-bmj", "ministry", "Bundesministerium der Justiz", { level: "bund", geography_id: "geo-bund", aliases: ["BMJ", "Justizministerium"], domain: "bmj.de" })
];

// --- Gerichte + Rechnungshof (Basis-Seed hat nur authority-bundesrechnungshof) ---------------
const COURTS = [
  e("court-bverfg", "authority", "Bundesverfassungsgericht", { level: "bund", geography_id: "geo-bund", aliases: ["BVerfG", "Verfassungsgericht"], domain: "bundesverfassungsgericht.de" })
];

// --- Oeffentliche Datenportale ---------------------------------------------------------------
const DATA_PORTALS = [
  e("portal-govdata", "authority", "GovData — Datenportal für Deutschland", { level: "bund", geography_id: "geo-bund", aliases: ["GovData"], domain: "govdata.de" })
];

// --- Wissenschaft / Thinktanks / NGO (Auswahl, Phase 6) --------------------------------------
const RESEARCH = [
  e("science-swp", "other_institution", "Stiftung Wissenschaft und Politik", { level: "bund", geography_id: "geo-bund", aliases: ["SWP"], domain: "swp-berlin.org" }),
  e("science-diw", "other_institution", "Deutsches Institut für Wirtschaftsforschung", { level: "bund", geography_id: "geo-bund", aliases: ["DIW"], domain: "diw.de" }),
  e("science-ifo", "other_institution", "ifo Institut", { level: "bund", geography_id: "geo-bund", aliases: ["ifo"], domain: "ifo.de" }),
  e("ngo-transparency", "association", "Transparency International Deutschland", { level: "bund", geography_id: "geo-bund", aliases: ["Transparency"], domain: "transparency.de" })
];

// --- Bundeslaender-Landesportale (alle 16, offizielle stabile Landesdomains) ------------------
// Ein Landesportal je Bundesland deckt "Alle Bundeslaender" (Phase 6) belegbar ab.
const LAND_PORTALS = [
  ["baden-wuerttemberg", "Landesportal Baden-Württemberg", "baden-wuerttemberg.de"],
  ["bayern", "Bayerisches Landesportal", "bayern.de"],
  ["berlin", "Landesportal Berlin", "berlin.de"],
  ["brandenburg", "Landesportal Brandenburg", "brandenburg.de"],
  ["bremen", "Landesportal Bremen", "bremen.de"],
  ["hamburg", "Landesportal Hamburg", "hamburg.de"],
  ["hessen", "Landesportal Hessen", "hessen.de"],
  ["mecklenburg-vorpommern", "Landesregierung Mecklenburg-Vorpommern", "regierung-mv.de"],
  ["niedersachsen", "Landesportal Niedersachsen", "niedersachsen.de"],
  ["nordrhein-westfalen", "Landesportal Nordrhein-Westfalen", "land.nrw"],
  ["rheinland-pfalz", "Landesportal Rheinland-Pfalz", "rlp.de"],
  ["saarland", "Landesportal Saarland", "saarland.de"],
  ["sachsen", "Landesportal Sachsen", "sachsen.de"],
  ["sachsen-anhalt", "Landesportal Sachsen-Anhalt", "sachsen-anhalt.de"],
  ["schleswig-holstein", "Landesportal Schleswig-Holstein", "schleswig-holstein.de"],
  ["thueringen", "Landesportal Thüringen", "thueringen.de"]
].map(([slug, name, domain]) => e(`landportal-${slug}`, "government", name, {
  level: "land", geography_id: `geo-land-${slug}`, domain
}));

const MASTER_ENTITIES_EXTRA = [
  ...MINISTRIES_EXTRA, ...COURTS, ...DATA_PORTALS, ...RESEARCH, ...LAND_PORTALS
];

module.exports = {
  MASTER_ENTITIES_EXTRA,
  MINISTRIES_EXTRA, COURTS, DATA_PORTALS, RESEARCH, LAND_PORTALS
};
