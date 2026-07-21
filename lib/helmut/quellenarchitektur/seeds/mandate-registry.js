"use strict";

// Helmut — Sprint 1 "Universelles Mandatsregister" · Seed: die datengetriebene
// Registry aus Parteien, Fraktionen, Ausschuessen, Funktionen und den daraus
// abgeleiteten Politikfeldern/Themen.
//
// ZWECK: EINE erweiterbare Datenquelle, die fuer JEDEN Bundestagsabgeordneten
// (unabhaengig von Partei, Fraktion, Ausschuss) beantwortet:
//   • welche Partei/Fraktion gehoert dazu (Partei -> Fraktion ist hier DATEN),
//   • welche Ausschuesse es gibt und welches Politikfeld/Thema daraus folgt,
//   • welche Funktionen (Vorsitz/Obmann/Sprecher/…) es gibt.
//
// PRINZIP (Auftrag §6 "vollstaendig datengetrieben und erweiterbar"):
//   - KEINE Partei/Ausschuss-Sonderlogik im Code des Resolvers. Neue Partei,
//     neuer Ausschuss, neues Thema = EINE Datenzeile hier, kein Code-Change.
//   - WIEDERVERWENDUNG statt Doppelmodell: die Kern-Entitaeten kommen aus
//     seeds/entities.js; dieses Modul ergaenzt NUR die Relationen, die dort
//     (bewusst) fehlen (Partei->Fraktion, Ausschuss->Politikfeld/Themen/Ministerium).
//   - Kanonische Schluessel kommen aus matching.js (normalizeParty /
//     committeeMatchKey — die KOLLISIONSSICHERE Variante, damit z. B. der
//     Menschenrechtsausschuss nicht auf "recht" faellt). Ranking-relevante
//     matching.js-Interna bleiben UNANGETASTET; zusaetzliche Schreibvarianten
//     werden hier per `aliases` DATENGETRIEBEN erkannt.
//
// Reine Daten + reine Lookups. Kein Netz, keine KI, kein Storage, kein Rendering.

const {
  PARTIES, FRACTIONS, COMMITTEES
} = require("./entities");
const { normalizeParty, committeeMatchKey } = require("../../matching");

// Umlaut-Faltung lokal (matching.js exportiert foldUmlauts nicht; identische Regel).
function foldUmlauts(s) {
  return String(s || "").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

const REGISTRY_VERSION = "2026-07-mandatsregister-1";

// --- Partei -> Fraktion (DATEN, keine Logik) --------------------------------
// Schluessel = normalizeParty(...) einer Partei; Wert = stabiler Fraktions-Key
// (identisch zu den `fraction-<key>`-IDs in sources.js, damit die spaetere
// universelle Quellenbibliothek direkt andocken kann). CDU/CSU/Union teilen sich
// EINE Bundestagsfraktion — das ist hier eine Datenaussage, kein Sonderfall.
const PARTY_TO_FRACTION = {
  cdu: "cdu-csu", csu: "cdu-csu", union: "cdu-csu",
  spd: "spd", gruene: "gruene", linke: "linke",
  afd: "afd", fdp: "fdp", bsw: "bsw", ssw: "ssw"
};

// Fraktions-Key -> zugehoerige Entitaet in entities.js (FRACTIONS).
const FRACTION_ENTITY_BY_KEY = {
  "cdu-csu": "group-bt-cdu-csu", "spd": "group-bt-spd", "gruene": "group-bt-gruene",
  "linke": "group-bt-linke", "afd": "group-bt-afd", "fdp": "group-bt-fdp",
  "bsw": "group-bt-bsw", "ssw": "group-bt-ssw"
};

// --- Ausschuss-Relationen (DATEN) -------------------------------------------
// key = committeeMatchKey(name) des Fachausschusses (kollisionssicher). Fuer JEDEN
// der 23 Bundestagsausschuesse: Politikfeld-Label, Leitministerium (falls es eines
// gibt), Thementermini (Seed fuer die spaetere Quellenbibliothek) und optionale
// Schreibvarianten (aliases), die committeeMatchKey (bewusst) nicht abdeckt.
// petitionen ist ein Verfahrensgremium OHNE Politikfeld -> policyField:null (ehrlich).
const COMMITTEE_RELATIONS = {
  "arbeit-und-soziales": {
    policyField: "Arbeit und Soziales", ministry: "BMAS", ministryEntity: "ministry-bmas",
    themeTerms: ["arbeit", "soziales", "buergergeld", "mindestlohn", "rente", "pflege", "arbeitsmarkt", "sozialstaat", "tarifbindung", "grundsicherung", "sozialversicherung", "arbeitsrecht", "arbeitszeit"],
    aliases: []
  },
  "gesundheit": {
    policyField: "Gesundheit", ministry: "BMG", ministryEntity: "ministry-bmg",
    themeTerms: ["gesundheit", "krankenhaus", "krankenkasse", "pflegeversicherung", "gesundheitsreform", "arzneimittel", "praevention"],
    aliases: []
  },
  "finanzen": {
    policyField: "Finanzen", ministry: "BMF", ministryEntity: "ministry-bmf",
    themeTerms: ["finanzen", "steuer", "schuldenbremse", "haushalt", "finanzmarkt", "steuerreform"],
    aliases: []
  },
  "haushalt": {
    policyField: "Haushalt", ministry: "BMF", ministryEntity: "ministry-bmf",
    themeTerms: ["bundeshaushalt", "etat", "haushaltsentwurf", "sparhaushalt", "sondervermoegen"],
    aliases: []
  },
  "verteidigung": {
    policyField: "Verteidigung", ministry: "BMVg", ministryEntity: null,
    themeTerms: ["bundeswehr", "verteidigung", "wehrdienst", "ruestung", "nato", "sicherheitspolitik"],
    aliases: []
  },
  "inneres": {
    policyField: "Inneres", ministry: "BMI", ministryEntity: "ministry-bmi",
    themeTerms: ["inneres", "migration", "asyl", "polizei", "bevoelkerungsschutz", "verfassungsschutz", "extremismus"],
    aliases: ["inneres und heimat"]
  },
  "recht": {
    policyField: "Recht", ministry: "BMJ", ministryEntity: null,
    themeTerms: ["justiz", "rechtspolitik", "strafrecht", "verfassung", "verbraucherschutz"],
    aliases: ["recht und verbraucherschutz"]
  },
  "wirtschaft": {
    policyField: "Wirtschaft", ministry: "BMWK", ministryEntity: null,
    themeTerms: ["wirtschaft", "energie", "industrie", "mittelstand", "energiewende", "wettbewerb"],
    aliases: ["wirtschaft und energie", "wirtschaft und klimaschutz"]
  },
  "umwelt": {
    policyField: "Umwelt", ministry: "BMUV", ministryEntity: null,
    themeTerms: ["klimaschutz", "umwelt", "naturschutz", "energiewende", "klimapolitik", "artenschutz"],
    aliases: ["klima und umwelt", "umwelt naturschutz nukleare sicherheit und verbraucherschutz"]
  },
  "ernaehrung": {
    policyField: "Ernährung und Landwirtschaft", ministry: "BMEL", ministryEntity: null,
    themeTerms: ["landwirtschaft", "ernaehrung", "bauern", "agrarpolitik", "tierschutz", "lebensmittel"],
    aliases: ["ernaehrung und landwirtschaft", "landwirtschaft"]
  },
  "familie": {
    policyField: "Familie", ministry: "BMFSFJ", ministryEntity: "ministry-bmfsfj",
    themeTerms: ["familienpolitik", "kindergeld", "kindergrundsicherung", "jugend", "gleichstellung", "senioren"],
    aliases: ["familie senioren frauen und jugend"]
  },
  "bildung": {
    policyField: "Bildung", ministry: "BMBF", ministryEntity: null,
    themeTerms: ["bildungspolitik", "forschung", "hochschule", "wissenschaft", "bafoeg", "schule", "ausbildung"],
    aliases: ["bildung und forschung", "bildung forschung und technikfolgenabschaetzung"]
  },
  "verkehr": {
    policyField: "Verkehr", ministry: "BMDV", ministryEntity: null,
    themeTerms: ["verkehrspolitik", "bahn", "deutschlandticket", "autobahn", "mobilitaet", "infrastruktur"],
    aliases: ["digitales und verkehr", "verkehr und digitale infrastruktur"]
  },
  "digitales": {
    policyField: "Digitales", ministry: "BMDV", ministryEntity: null,
    themeTerms: ["digitalpolitik", "digitalisierung", "kuenstliche intelligenz", "datenschutz", "breitband", "cybersicherheit"],
    aliases: ["digital", "digitalausschuss"]
  },
  "wohnen": {
    policyField: "Wohnen und Bau", ministry: "BMWSB", ministryEntity: null,
    themeTerms: ["wohnungspolitik", "mieten", "wohnungsbau", "mietpreisbremse", "stadtentwicklung", "bauen"],
    aliases: ["bauen und wohnen", "wohnen stadtentwicklung bauwesen und kommunen", "bau"]
  },
  "menschenrechte": {
    policyField: "Menschenrechte", ministry: null, ministryEntity: null,
    themeTerms: ["menschenrechte", "humanitaere hilfe"],
    // Kollisions-Absicherung: committeeMatchKey faellt bei der Kompositum-Schreibung
    // "Menschenrechtsausschuss" auf "recht" zurueck (dokumentierte Kollision). Diese
    // Alias-Formen erkennt der Resolver DATENGETRIEBEN, bevor er matchKey befragt.
    aliases: ["menschenrechte und humanitaere hilfe", "menschenrechts", "menschenrechtsausschuss"]
  },
  "kultur": {
    policyField: "Kultur und Medien", ministry: "BKM", ministryEntity: null,
    themeTerms: ["kulturpolitik", "medienpolitik", "rundfunkbeitrag", "kulturstaatsminister"],
    aliases: ["kultur und medien"]
  },
  "entwicklung": {
    policyField: "Entwicklung", ministry: "BMZ", ministryEntity: null,
    themeTerms: ["entwicklungspolitik", "entwicklungshilfe", "entwicklungszusammenarbeit"],
    aliases: ["wirtschaftliche zusammenarbeit und entwicklung"]
  },
  "auswaertiges": {
    policyField: "Auswärtiges", ministry: "Auswärtiges Amt", ministryEntity: "ministry-auswaertiges-amt",
    themeTerms: ["aussenpolitik", "diplomatie", "auswaertiges amt", "internationale beziehungen"],
    aliases: ["auswaertiger"]
  },
  "europa": {
    policyField: "Europa", ministry: null, ministryEntity: null,
    themeTerms: ["europapolitik", "europaeische union", "eu-kommission", "bruessel"],
    aliases: ["angelegenheiten der europaeischen union", "europaeische union"]
  },
  "tourismus": {
    policyField: "Tourismus", ministry: null, ministryEntity: null,
    themeTerms: ["tourismuspolitik", "tourismusbranche"],
    aliases: []
  },
  "sport": {
    policyField: "Sport", ministry: null, ministryEntity: null,
    themeTerms: ["sportpolitik", "sportfoerderung", "spitzensport"],
    aliases: ["sport und ehrenamt"]
  },
  "petitionen": {
    policyField: null, ministry: null, ministryEntity: null,
    themeTerms: [], aliases: []
  }
};

// --- Quellenpaket-Index (DATEN, erweiterbar) --------------------------------
// Welches Quellenpaket versorgt eine Partei bzw. ein Politikfeld (Ausschuss)?
// HEUTE existieren nur die vier Pilot-Pakete — deshalb ist dieser Index bewusst
// duenn. Sprint 2 (universelle Quellenbibliothek) FUELLT ihn: pro Partei ein
// Parteipaket, pro Politikfeld ein Themenpaket. Der Mandatsregister-Resolver liest
// den Index rein datengetrieben und weist EHRLICH aus, was heute fehlt
// (supplyOutlook.gaps) — ohne ein Mandat deswegen faelschlich als versorgt zu melden.
const PARTY_PACKAGE_KEYS = {
  // partyKey (normalizeParty) -> vorhandener Paket-Key
  linke: "die-linke-bund"
};
// committeeKey (committeeMatchKey) -> vorhandenes Themenpaket
const COMMITTEE_PACKAGE_KEYS = {
  "arbeit-und-soziales": "arbeit-und-soziales"
};

function partyPackageKey(partyKey) { return PARTY_PACKAGE_KEYS[String(partyKey || "")] || null; }
function committeePackageKey(committeeKey) { return COMMITTEE_PACKAGE_KEYS[String(committeeKey || "")] || null; }

// --- Funktionen im Mandat (DATEN) -------------------------------------------
// Datengetriebener Katalog parlamentarischer Funktionen; erweiterbar. Jeder
// Eintrag: kanonischer Key + Label + Erkennungs-Termini (matchen am Wortstamm).
const FUNCTIONS = [
  { key: "vorsitz", label: "Vorsitz", weight: 5, terms: ["vorsitzende", "vorsitzender", "vorsitz", "ausschussvorsitz"] },
  { key: "stellv-vorsitz", label: "Stellv. Vorsitz", weight: 4, terms: ["stellvertretende vorsitz", "stellv vorsitz", "stellvertretender vorsitz"] },
  { key: "obmann", label: "Obmann/Obfrau", weight: 4, terms: ["obmann", "obfrau", "obleute"] },
  { key: "sprecher", label: "Sprecher:in", weight: 4, terms: ["sprecher", "sprecherin", "fachsprecher", "sprecherinnen"] },
  { key: "berichterstatter", label: "Berichterstatter:in", weight: 3, terms: ["berichterstatter", "berichterstatterin"] },
  { key: "fraktionsvorstand", label: "Fraktionsvorstand", weight: 4, terms: ["fraktionsvorsitz", "parlamentarische geschaeftsfuehr", "fraktionsvorstand", "stellvertretende fraktionsvorsitz"] },
  { key: "mitglied", label: "Ordentliches Mitglied", weight: 2, terms: ["ordentliches mitglied", "mitglied"] },
  { key: "stellv-mitglied", label: "Stellvertretendes Mitglied", weight: 1, terms: ["stellvertretendes mitglied", "stellv mitglied"] }
];

// --- Build: kanonische Indizes ----------------------------------------------
function buildPartyIndex() {
  const byKey = new Map();
  for (const p of PARTIES) {
    const key = normalizeParty(p.name);
    byKey.set(key, {
      key, name: p.name, entity_id: p.id,
      aliases: p.aliases || [],
      fractionKey: PARTY_TO_FRACTION[key] || null
    });
  }
  return byKey;
}

function buildFractionIndex() {
  const byKey = new Map();
  // Partei-Keys je Fraktion umkehren.
  const partyKeysByFraction = {};
  for (const [partyKey, fracKey] of Object.entries(PARTY_TO_FRACTION)) {
    (partyKeysByFraction[fracKey] = partyKeysByFraction[fracKey] || []).push(partyKey);
  }
  for (const [fracKey, entityId] of Object.entries(FRACTION_ENTITY_BY_KEY)) {
    const ent = FRACTIONS.find((f) => f.id === entityId) || {};
    byKey.set(fracKey, {
      key: fracKey, name: ent.name || fracKey, entity_id: entityId,
      partyKeys: partyKeysByFraction[fracKey] || []
    });
  }
  return byKey;
}

function buildCommitteeIndex() {
  const byKey = new Map();
  const aliasToKey = new Map();
  for (const c of COMMITTEES) {
    const key = committeeMatchKey(c.name); // kollisionssicher
    const rel = COMMITTEE_RELATIONS[key] || { policyField: null, ministry: null, ministryEntity: null, themeTerms: [], aliases: [] };
    byKey.set(key, {
      key, name: c.name, entity_id: c.id,
      policyField: rel.policyField,
      ministry: rel.ministry, ministryEntity: rel.ministryEntity,
      themeTerms: rel.themeTerms || [],
      aliases: rel.aliases || []
    });
    for (const a of rel.aliases || []) aliasToKey.set(normAlias(a), key);
  }
  return { byKey, aliasToKey };
}

function normAlias(s) {
  return foldUmlauts(String(s == null ? "" : s).toLowerCase())
    .replace(/&/g, "und").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Entfernt die Ausschuss-Affixe analog committeeMatchKey, damit Alias-Treffer auch
// bei "Ausschuss fuer X" / "Xausschuss" greifen ("Menschenrechtsausschuss" -> "menschenrechts").
function stripCommitteeAffixes(normalized) {
  let s = String(normalized || "");
  s = s.replace(/^ausschuss\s+(fuer|zur|zum|des|der|fur)\s+/, "");
  s = s.replace(/\s*ausschuss$/, "").trim();
  return s;
}

const PARTY_INDEX = buildPartyIndex();
const FRACTION_INDEX = buildFractionIndex();
const { byKey: COMMITTEE_INDEX, aliasToKey: COMMITTEE_ALIAS_INDEX } = buildCommitteeIndex();

// --- Oeffentliche Lookups (rein) --------------------------------------------
function listParties() { return [...PARTY_INDEX.values()]; }
function getParty(key) { return PARTY_INDEX.get(String(key || "")) || null; }
// Rohwert -> {resolved, key}. known = in der Registry vorhanden.
function resolveParty(raw) {
  const key = normalizeParty(raw);
  const hit = PARTY_INDEX.get(key);
  return { raw: raw == null ? "" : String(raw), key: key || null, known: Boolean(hit), party: hit || null };
}

function listFractions() { return [...FRACTION_INDEX.values()]; }
function getFraction(key) { return FRACTION_INDEX.get(String(key || "")) || null; }
function fractionForParty(partyKey) {
  const fk = PARTY_TO_FRACTION[String(partyKey || "")];
  return fk ? FRACTION_INDEX.get(fk) || null : null;
}

function listCommittees() { return [...COMMITTEE_INDEX.values()]; }
function getCommittee(key) { return COMMITTEE_INDEX.get(String(key || "")) || null; }
// Rohwert -> {resolved, key, known}. DATENGETRIEBENE Alias-Tabelle ZUERST (faengt die
// dokumentierten Kollisionen ab, bei denen committeeMatchKey auf einen falschen bekannten
// Schluessel faellt, z. B. Menschenrechtsausschuss -> recht), dann kollisionssicherer matchKey.
function resolveCommittee(raw) {
  const normed = normAlias(raw);
  const aliasKey = COMMITTEE_ALIAS_INDEX.get(normed) || COMMITTEE_ALIAS_INDEX.get(stripCommitteeAffixes(normed));
  let hit = aliasKey ? COMMITTEE_INDEX.get(aliasKey) : null;
  let key = aliasKey || null;
  if (!hit) {
    key = committeeMatchKey(raw);
    hit = COMMITTEE_INDEX.get(key);
  }
  return {
    raw: raw == null ? "" : String(raw),
    key: hit ? hit.key : (key || null),
    known: Boolean(hit),
    committee: hit || null
  };
}

function listFunctions() { return FUNCTIONS.slice(); }
function resolveFunction(raw) {
  const s = normAlias(raw);
  if (!s) return null;
  // "Maximal munch": der LAENGSTE (spezifischste) getroffene Term gewinnt, damit
  // "Stellvertretende Vorsitzende" -> stellv-vorsitz (nicht die kuerzere Basis "vorsitz").
  // Termlaenge schlaegt Gewicht; Gewicht ist nur Tiebreak bei gleich langem Treffer.
  let best = null; let bestLen = -1;
  for (const fn of FUNCTIONS) {
    for (const t of fn.terms) {
      const tn = normAlias(t);
      if (s.includes(tn)) {
        if (tn.length > bestLen || (tn.length === bestLen && best && fn.weight > best.weight)) {
          best = fn; bestLen = tn.length;
        }
      }
    }
  }
  return best ? { key: best.key, label: best.label, weight: best.weight } : null;
}

function registrySummary() {
  const committees = listCommittees();
  return {
    version: REGISTRY_VERSION,
    parties: PARTY_INDEX.size,
    fractions: FRACTION_INDEX.size,
    committees: committees.length,
    committeesWithPolicyField: committees.filter((c) => c.policyField).length,
    functions: FUNCTIONS.length
  };
}

module.exports = {
  REGISTRY_VERSION,
  PARTY_TO_FRACTION,
  COMMITTEE_RELATIONS,
  PARTY_PACKAGE_KEYS,
  COMMITTEE_PACKAGE_KEYS,
  FUNCTIONS,
  listParties, getParty, resolveParty,
  listFractions, getFraction, fractionForParty,
  listCommittees, getCommittee, resolveCommittee,
  partyPackageKey, committeePackageKey,
  listFunctions, resolveFunction,
  registrySummary
};
