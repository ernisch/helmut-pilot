"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Seed: Master-Pakete mit DATENGETRIEBENEN Kriterien.
//
// Reine Daten + reine Generatoren. Ein Paket beschreibt ueber `criteria` (Daten), welche Quellen
// es aufnimmt (siehe assignment.js). Per-Partei- und Per-Bundesland-Pakete werden AUS den Seeds
// generiert — eine neue Partei/ein neues Bundesland erzeugt automatisch ein Paket, OHNE Code-
// Aenderung (Abnahme §7/§8, Tests §23/§25). KEINE Partei/kein Land ist im Code hartcodiert.

const { PARTIES, FRACTIONS, COMMITTEES } = require("../../seeds/entities");
const { LAENDER } = require("../../seeds/geographies");

function pkg(key, name, criteria, extra = {}) {
  return { key, id: `mpkg-${key}`, name, is_base: !!extra.is_base, purpose: extra.purpose || "", criteria };
}

// --- Feste Basis-/Querschnittspakete ---------------------------------------------------------
const FIXED_PACKAGES = [
  pkg("bund-basis", "Bund Basis (institutionelle Grundversorgung)", {
    source_types: ["parlament", "bundesregierung", "bundesrat", "ministerium", "ausschuss", "behoerde", "datenportal", "rechnungshof", "gericht"],
    political_levels: ["bund"]
  }, { is_base: true, purpose: "Neutrale bundespolitische Grundversorgung fuer JEDES Mandat." }),
  pkg("medien-ueberregional", "Überregionale Medien", { source_types: ["medien_ueberregional"] },
    { purpose: "Journalistische Einordnung ueberregional." }),
  pkg("fachoeffentlichkeit", "Fachöffentlichkeit", {
    source_types: ["gewerkschaft", "arbeitgeberverband", "fachverband", "wissenschaft", "thinktank", "ngo"]
  }, { purpose: "Verbaende, Gewerkschaften, Arbeitgeber, Wissenschaft, Thinktanks, NGOs." }),
  // Gegenpositionen: Partei-/Fraktionsquellen; Suchanbieter als Rueckfall zulaessig (search_provider_ok),
  // die Alleinversorgung durch Suchanbieter wird aber erst im Versorgungsstandard/Coverage geahndet.
  pkg("gegenpositionen", "Politische Gegenpositionen (Ausgewogenheit)", { source_types: ["partei", "fraktion"], search_provider_ok: true },
    { purpose: "Buendelt Partei-/Fraktionsquellen fuer die Ausgewogenheitspruefung." })
];

// --- Generator: ein Paket je Partei (Partei + zugehoerige Fraktion) ---------------------------
function partyPackages() {
  const fractionByKey = new Map(FRACTIONS.map((f) => [f.canonical_key, f]));
  return PARTIES.map((p) => {
    const faction = fractionByKey.get(p.canonical_key);
    // Suchanbieter als Rueckfall zulaessig (search_provider_ok) — nie alleinige Versorgung
    // (das ahndet der Versorgungsstandard/Coverage, nicht die Zuweisung).
    const criteria = { party_ids: [p.id], matchAny: true, search_provider_ok: true };
    if (faction) criteria.group_ids = [faction.id];
    return pkg(`partei-${p.canonical_key || p.id}`, `Partei-Versorgung ${p.name}`, criteria,
      { purpose: `Direktquellen Partei/Fraktion ${p.name}.` });
  });
}

// --- Generator: ein Paket je Bundesland (Regionalversorgung) ----------------------------------
function landPackages() {
  return LAENDER.map((l) => pkg(
    `land-${l.id.replace(/^geo-land-/, "")}`, `Regionalversorgung ${l.name}`,
    { region_ids: [l.id], source_types: ["bundesland", "landtag", "landesregierung", "kommunal", "medien_regional"], matchAny: false, search_provider_ok: true },
    { is_base: false, purpose: `Landes-/Regionalquellen ${l.name}.` }
  ));
}

// --- Generator: ein Paket je Ausschuss (Ausschussversorgung) ----------------------------------
function committeePackages() {
  return COMMITTEES.map((c) => pkg(
    `ausschuss-${c.id.replace(/^committee-bt-/, "")}`, `Ausschussversorgung ${c.name}`,
    // Ausschuesse sind heute real ueber Suchanbieter abgedeckt -> Rueckfall zulaessig; die
    // Alleinversorgung durch Suchanbieter wird im Versorgungsstandard/Coverage sichtbar geahndet.
    { committee_ids: [c.id], search_provider_ok: true }, { purpose: `Quellen zum ${c.name}.` }
  ));
}

function buildMasterPackages() {
  return [...FIXED_PACKAGES, ...partyPackages(), ...landPackages(), ...committeePackages()];
}

module.exports = { FIXED_PACKAGES, partyPackages, landPackages, committeePackages, buildMasterPackages };
