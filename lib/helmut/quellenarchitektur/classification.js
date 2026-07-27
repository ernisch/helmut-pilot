"use strict";

// Helmut — Neue Quellenarchitektur · Knowledge-Object-Klassifikation (Sprint 2).
//
// Reine, deterministische Logik (KEINE KI, kein Netz, kein Storage). Erzeugt die
// strukturierten Klassifikationsfelder eines Vorgangs:
//   decision_level / related_levels  (politische Entscheidungsebene, Auftrag §11)
//   affected_geographies / mentioned_geographies  (Geografie, aufgeloest gegen Seed)
//     SPRINT 20: die Geografie wird NICHT MEHR aus decision_level abgeleitet. Sie
//     entsteht ausschliesslich aus Nachweisen (Parser > amtlich > Inhalt > KI) und
//     bleibt ehrlich leer, wenn keiner vorliegt. Details: geografie-gedaechtnis.js.
//   decision_entities / related_entities  (typisierte Entitaeten, aufgeloest gegen Seed)
//   event_type  (Ereignistyp)  ·  classification_confidence  (dimensioniert)
//
// ZWECK: das Kernproblem "political_level bei allen 231 KOs leer" strukturell beheben.
// Die KI liefert diese Felder (wenn moeglich); dieser Deriver fuellt Luecken deterministisch
// aus den bereits belegten Feldern (Ausschuesse/Ministerien/Erwaehnungen) und garantiert so
// NIE-leere, konsistente Werte. Fuer Alt-KOs (Backfill) laeuft er ganz ohne KI (kostenneutral).
//
// Aufloesung von Namen -> kanonische IDs erfolgt gegen die Sprint-1-Seeds (Geografie/Entitaet).
// Unaufloesbare Namen bleiben mit entity_id/geography_id = null erhalten (kein erfundener Treffer).

const { GEOGRAPHIES } = require("./seeds/geographies");
const { POLITICAL_ENTITIES } = require("./seeds/entities");
const { normalizeParty, normalizeCommittee } = require("../matching");
// Sprint 19: einmal ermittelte Ebene wiederverwenden statt jedes Mal neu ableiten.
const { entscheideEbene } = require("./ebenen-gedaechtnis");
// Sprint 20: Geografie ist eine EIGENE Frage, nicht die Kehrseite der Ebene.
const { entscheideGeografien, geografieKonfidenz } = require("./geografie-gedaechtnis");

const LEVELS = ["international", "eu", "bund", "land", "kommune"];
const CONF = ["low", "medium", "high", "unknown"];

const EVENT_TYPES = [
  "gesetzentwurf", "verordnung", "antrag", "anfrage", "anhoerung", "abstimmung",
  "kabinettsbeschluss", "urteil", "bericht", "personalie", "protest", "sonstiges", "unknown"
];

// --- Normalisierung ---------------------------------------------------------
function normText(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// --- Geografie-Index (Name -> {id, level}) ----------------------------------
const GEO_BY_NAME = (() => {
  const idx = new Map();
  for (const g of GEOGRAPHIES) {
    idx.set(normText(g.name), { id: g.id, level: g.level, name: g.name });
  }
  // "Deutschland" / "Bund" -> geo-bund
  idx.set("deutschland", { id: "geo-bund", level: "bund", name: "Deutschland" });
  idx.set("bund", { id: "geo-bund", level: "bund", name: "Deutschland" });
  return idx;
})();

// --- Entitaets-Index --------------------------------------------------------
// (a) exakter Name/Alias-Match  (b) canonical_key je Typ (Partei/Ausschuss).
const ENTITY_BY_NAME = new Map();
const ENTITY_BY_KEY = new Map(); // `${type}:${canonical_key}` -> entity
const ENTITY_BY_ID = new Map();
for (const ent of POLITICAL_ENTITIES) {
  ENTITY_BY_NAME.set(normText(ent.name), ent);
  for (const al of ent.aliases || []) ENTITY_BY_NAME.set(normText(al), ent);
  if (ent.canonical_key) ENTITY_BY_KEY.set(`${ent.entity_type}:${ent.canonical_key}`, ent);
  ENTITY_BY_ID.set(ent.id, ent);
}

// --- Geografie-Index nach ID (fuer die Aufloesung kanonischer Referenzen) ----
const GEO_BY_ID = new Map(GEOGRAPHIES.map((g) => [g.id, g]));

// SPRINT 20 — die einzige zulaessige Ableitung "Institution -> Geografie".
//
// Nur SUBNATIONALE Entscheidungskoerper zaehlen: ein Abgeordnetenhaus, ein
// Senat, eine Landesregierung, ein Landtag traegt echte regionale Information.
// BUNDESinstitutionen sind ausgeschlossen — "Bundestag" sagt geografisch nichts
// aus, was nicht schon die Ebene sagt; sie zuzulassen waere exakt die verbotene
// Ableitung "decision_level -> Geografie" durch die Hintertuer (Regel 1/3).
//
// Ebenso ausgeschlossen sind Parteien, Personen, Organisationen und statistische
// Aemter: sie sind Akteure oder Herausgeber, keine regional zustaendigen
// Entscheidungskoerper.
const GEO_TRAGENDE_ENTITAETSTYPEN = new Set(["parliament", "government", "ministry", "committee"]);

function subnationaleGeografieVonEntitaet(entityId) {
  const ent = entityId ? ENTITY_BY_ID.get(entityId) : null;
  if (!ent || !ent.geography_id) return null;
  if (!GEO_TRAGENDE_ENTITAETSTYPEN.has(ent.entity_type)) return null;
  const geo = GEO_BY_ID.get(ent.geography_id);
  if (!geo || geo.level === "bund") return null;
  return { name: geo.name, level: geo.level, geography_id: geo.id };
}

// ZWEITE, UNVERZICHTBARE SCHRANKE: die tatsaechlich gefundene BEZEICHNUNG muss den
// Namen der Geografie selbst enthalten.
//
// Ohne sie wuerde ein Alias wie "Senatskanzlei" (im Katalog an Berlin gebunden)
// eine Hamburger oder Bremer Meldung nach Berlin verschieben — eine erfundene
// Zuordnung, die Regel 3 ausdruecklich verbietet. Mit ihr zaehlt nur, was Institution
// UND Region zugleich benennt:
//   "Abgeordnetenhaus von Berlin" · "Berliner Senat" · "Landtag Brandenburg"   -> Beleg
//   "Senatskanzlei" · "Staatskanzlei" · "Landesregierung"                      -> KEIN Beleg
function bezeichnungNenntGeografie(bezeichnung, geo) {
  if (!geo) return false;
  const b = normText(bezeichnung);
  const g = normText(geo.name);
  return !!(b && g && b.includes(g));
}

// Aus EINER Bezeichnung (so wie sie im Vorgang steht) eine betroffene Geografie
// ableiten — oder null. Beide Schranken muessen halten.
function geografieAusInstitutionsnennung(bezeichnung) {
  const treffer = ENTITY_BY_NAME.get(normText(bezeichnung));
  if (!treffer) return null;
  const geo = subnationaleGeografieVonEntitaet(treffer.id);
  return bezeichnungNenntGeografie(bezeichnung, geo) ? geo : null;
}

// Dieselben Institutionsnennungen, aber im FLIESSTEXT des Vorgangs (Ueberschrift,
// "was ist passiert", …). Ohne diesen Weg bliebe der haeufigste reale Fall unbelegt:
// "Abgeordnetenhaus von Berlin beschliesst Nachtragshaushalt" nennt die Landes-
// institution in der Schlagzeile, nicht in einer strukturierten Liste. Es werden
// ausschliesslich Bezeichnungen gesucht, die die Schranke oben ohnehin bestehen —
// eine blosse Ortsnennung kann hier nie treffen.
const SUBNATIONALE_INSTITUTIONSPHRASEN = (() => {
  const out = [];
  for (const ent of POLITICAL_ENTITIES) {
    const geo = subnationaleGeografieVonEntitaet(ent.id);
    if (!geo) continue;
    for (const bezeichnung of [ent.name, ...(ent.aliases || [])]) {
      if (!bezeichnungNenntGeografie(bezeichnung, geo)) continue;
      out.push({ phrase: normText(bezeichnung), geo });
    }
  }
  // Laengste Phrase zuerst: "Abgeordnetenhaus von Berlin" schlaegt eine kuerzere,
  // in ihr enthaltene Bezeichnung — das Ergebnis haengt nicht an der Seed-Reihenfolge.
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
})();

// Die Prosafelder des Vorgangs. Jedes wird EINZELN normalisiert und durchsucht —
// bewusst NICHT als ein zusammengefuegter Text.
//
// Warum das wichtig ist: `koHaystack()` klebt alle Felder mit Leerzeichen zusammen.
// Ein Ausschusseintrag "Landtag" und eine getrennte Ortsnennung "Brandenburg"
// ergaeben dort die Zeichenfolge "landtag brandenburg" — die Phrase traefe, obwohl
// niemand "Landtag Brandenburg" geschrieben hat. Genau diese Art zufaelliger
// Nachbarschaft hat schon B4-3/B4-4 verursacht. Ein Beleg muss INNERHALB EINES
// Feldes stehen.
const GEO_TEXTFELDER = ["headline", "display_title", "was_ist_passiert", "warum_wichtig", "wer_ist_betroffen", "display_summary"];

function geografienAusText(ko = {}) {
  const out = [];
  for (const feld of GEO_TEXTFELDER) {
    const text = normText(ko[feld]);
    if (!text) continue;
    for (const eintrag of SUBNATIONALE_INSTITUTIONSPHRASEN) {
      if (eintrag.phrase && text.includes(eintrag.phrase)) out.push(eintrag.geo);
    }
  }
  return out;
}

// --- EU / Land / Bund - Signale --------------------------------------------
const EU_TERMS = ["eu", "europaeische union", "europaeische kommission", "eu kommission", "europaeisches parlament", "bruessel", "europarat"];
const LAND_INSTITUTION_TERMS = ["landtag", "abgeordnetenhaus", "senat", "landesregierung", "staatskanzlei", "senatskanzlei", "senatsverwaltung", "landesministerium"];
const BUND_INSTITUTION_TERMS = ["bundestag", "bundesregierung", "bundesrat", "bundeskabinett", "bundesministerium", "bundeskanzler"];

const BUNDESLAND_NAMES = new Set(
  GEOGRAPHIES.filter((g) => g.level === "land").map((g) => normText(g.name))
);

// Wortgrenzen-sicher: kurze Einzelwort-Terme ("eu") duerfen NICHT als Substring
// matchen (sonst "eu" in "deutschland"). Mehrwort-Terme bleiben Substring-Match.
function hasTerm(haystack, term) {
  if (!term) return false;
  if (term.includes(" ")) return haystack.includes(term);
  return new RegExp(`(^| )${term}( |$)`).test(haystack);
}
function anyTermIn(haystack, terms) {
  return terms.some((t) => hasTerm(haystack, t));
}

// Kollisionsfreier Ausschuss-Schluessel: normalizeCommittee liefert fuer
// "Menschenrechte …" faelschlich "recht" (Kollision mit dem Rechtsausschuss).
function committeeKey(name) {
  const n = normText(name);
  if (n.includes("menschenrecht")) return "menschenrechte";
  return normalizeCommittee(name);
}

// --- Geografie aufloesen ----------------------------------------------------
function resolveGeography(name) {
  const key = normText(name);
  if (!key) return null;
  const hit = GEO_BY_NAME.get(key);
  if (hit) return { name: hit.name, level: hit.level, geography_id: hit.id };
  return { name: String(name).slice(0, 120), level: "unknown", geography_id: null };
}

function resolveGeographies(names) {
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(names) ? names : []) {
    const r = resolveGeography(n);
    if (!r) continue;
    const k = r.geography_id || normText(r.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// --- Entitaet aufloesen -----------------------------------------------------
// typeHint: 'party' | 'committee' | 'ministry' | 'person' | 'organization' | null
function resolveEntity(name, typeHint) {
  const raw = String(name || "").trim();
  if (!raw) return null;
  const nName = normText(raw);
  // 1) exakter Name/Alias
  const byName = ENTITY_BY_NAME.get(nName);
  if (byName) return { name: byName.name, type: byName.entity_type, entity_id: byName.id, confidence: "high" };
  // 2) typ-spezifischer canonical_key
  if (typeHint === "party") {
    const ent = ENTITY_BY_KEY.get(`party:${normalizeParty(raw)}`);
    if (ent) return { name: ent.name, type: ent.entity_type, entity_id: ent.id, confidence: "medium" };
  }
  if (typeHint === "committee") {
    const ent = ENTITY_BY_KEY.get(`committee:${committeeKey(raw)}`);
    if (ent) return { name: ent.name, type: ent.entity_type, entity_id: ent.id, confidence: "medium" };
  }
  // 3) unaufloesbar -> ehrlich mit null-ID erhalten
  return { name: raw.slice(0, 120), type: typeHint || "unknown", entity_id: null, confidence: "low" };
}

function resolveEntities(names, typeHint) {
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(names) ? names : []) {
    const r = resolveEntity(n, typeHint);
    if (!r) continue;
    const k = r.entity_id || `${r.type}:${normText(r.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// --- Entscheidungsebene deterministisch ableiten ----------------------------
function koHaystack(ko = {}) {
  return normText([
    ...(ko.ausschuesse || []), ...(ko.ministerien || []), ...(ko.parteien || []),
    ...(ko.mentioned_committees || []), ...(ko.mentioned_ministries || []),
    ...(ko.mentioned_organizations || []), ...(ko.mentioned_locations || []),
    ko.headline, ko.was_ist_passiert, ko.warum_wichtig, ko.instrument, ko.stage
  ].filter(Boolean).join(" "));
}

// Liefert { level, confidence, signal }. Konservativ: klare EU/Land/Bund-Signale
// zuerst; OHNE erkennbares Signal ehrlich 'unknown' (NICHT automatisch 'bund' —
// siehe Fallthrough unten). Konfidenz markiert die Sicherheit.
function deriveDecisionLevel(ko = {}) {
  const hay = koHaystack(ko);
  const hasCommittee = (ko.ausschuesse || []).length > 0 || (ko.mentioned_committees || []).length > 0;
  const hasBundInst = anyTermIn(hay, BUND_INSTITUTION_TERMS) || hasCommittee;
  const hasLandInst = anyTermIn(hay, LAND_INSTITUTION_TERMS);
  const mentionsLand = [...BUNDESLAND_NAMES].some((l) => hay.includes(l));
  const hasEu = anyTermIn(hay, EU_TERMS);

  // EU nur, wenn EU-Institution/Begriff UND keine klare Bundes-Gesetzgebung dominiert.
  if (hasEu && !hasBundInst) return { level: "eu", confidence: "medium", signal: "eu-institution" };
  // Land nur, wenn eine LANDES-Institution genannt ist (nicht bloss ein Bundesland-Ort).
  if (hasLandInst && mentionsLand) return { level: "land", confidence: "medium", signal: "landes-institution" };
  if (hasLandInst) return { level: "land", confidence: "low", signal: "landes-institution-ohne-ort" };
  if (hasBundInst) return { level: "bund", confidence: "high", signal: "bundes-institution" };
  if (hasEu) return { level: "eu", confidence: "low", signal: "eu-begriff" };
  // KEIN erkennbares Ebenen-Signal -> ehrlich 'unknown', NICHT automatisch 'bund'.
  // Ein unsicherer (moeglicherweise Landes-)Vorgang darf nicht als Bundespolitik
  // einsortiert werden (verbindliche Nachschaerfung). Downstream behandelt 'unknown'
  // neutral: nicht als Bund matchen, im Admin als pruefbedürftig sichtbar.
  return { level: "unknown", confidence: "unknown", signal: "kein-signal" };
}

function deriveRelatedLevels(ko = {}, decisionLevel) {
  const hay = koHaystack(ko);
  const out = new Set();
  const mentionsLand = [...BUNDESLAND_NAMES].some((l) => hay.includes(l));
  if (anyTermIn(hay, EU_TERMS) && decisionLevel !== "eu") out.add("eu");
  if (mentionsLand && decisionLevel !== "land") out.add("land");
  if (anyTermIn(hay, BUND_INSTITUTION_TERMS) && decisionLevel !== "bund") out.add("bund");
  return [...out];
}

// --- Ereignistyp ableiten ---------------------------------------------------
const EVENT_KEYWORDS = [
  ["gesetzentwurf", ["gesetzentwurf", "referentenentwurf", "gesetz beschlossen", "gesetzespaket"]],
  ["verordnung", ["verordnung", "rechtsverordnung"]],
  ["kabinettsbeschluss", ["kabinettsbeschluss", "bundeskabinett", "kabinett beschliesst"]],
  ["anhoerung", ["anhoerung", "sachverstaendige", "expertenanhoerung"]],
  ["anfrage", ["kleine anfrage", "grosse anfrage", "schriftliche anfrage"]],
  ["abstimmung", ["abstimmung", "namentliche abstimmung", "beschlossen im bundestag", "verabschiedet"]],
  ["antrag", ["antrag", "entschliessungsantrag"]],
  ["urteil", ["urteil", "gericht", "bundesverfassungsgericht", "verfassungsgericht"]],
  ["personalie", ["ernennung", "ruecktritt", "nachfolge", "personalie", "berufen"]],
  ["protest", ["protest", "demonstration", "streik", "warnstreik"]],
  ["bericht", ["bericht", "studie", "gutachten", "statistik", "jahresbericht"]]
];

function deriveEventType(ko = {}) {
  const hay = koHaystack(ko);
  for (const [type, kws] of EVENT_KEYWORDS) {
    if (kws.some((k) => hay.includes(k))) return type;
  }
  return "unknown";
}

// --- Entitaeten trennen: Entscheider vs. Erwaehnte --------------------------
// decision_entities = handelnde Institutionen (Ausschuesse, Ministerien, Parlament/Regierung).
// related_entities  = erwaehnte Akteure (Parteien, Personen, Organisationen).
function buildDecisionEntities(ko = {}) {
  const out = [];
  out.push(...resolveEntities(ko.ausschuesse, "committee"));
  out.push(...resolveEntities(ko.ministerien, "ministry"));
  out.push(...resolveEntities(ko.mentioned_committees, "committee"));
  out.push(...resolveEntities(ko.mentioned_ministries, "ministry"));
  return dedupeEntities(out);
}

function buildRelatedEntities(ko = {}) {
  const out = [];
  out.push(...resolveEntities(ko.parteien, "party"));
  out.push(...resolveEntities(ko.mentioned_parties, "party"));
  out.push(...resolveEntities(ko.mentioned_organizations, "organization"));
  return dedupeEntities(out);
}

function dedupeEntities(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const k = e.entity_id || `${e.type}:${normText(e.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

// --- Hauptfunktion: vollstaendige Klassifikation ----------------------------
// ai: optionale KI-gelieferte Werte (aus dem Understanding-Call). Der Deriver hat
// Vorrang bei Luecken/Unsicherheit; gueltige KI-Werte werden bevorzugt uebernommen.
//
// opts (Sprint 19, beide optional — ohne sie ist das Verhalten unveraendert):
//   opts.bestand: das bereits GESPEICHERTE knowledge_object desselben Vorgangs.
//     Ist dort eine Ebene ermittelt, wird sie WIEDERVERWENDET statt neu berechnet
//     (ebenen-gedaechtnis.js). Damit kann eine einmal ermittelte Ebene nicht mehr
//     durch eine Aktualisierung auf 'unknown' zurueckfallen.
//   opts.jetzt: Zeitstempel einer Erstermittlung (Testbarkeit).
//
// opts (Sprint 20, alle optional — ohne sie bleibt die Geografie inhaltsgetrieben):
//   opts.strukturiert:      Geo-Referenzen eines Parlamentsparsers (staerkster Nachweis)
//   opts.amtlich:           eindeutige amtliche Geo-Metadaten
//   opts.quellenGeografien: Geografie des Abrufwegs — NUR INDIZ, nie betroffen
//   opts.bestand wird auch fuer die Geografie gelesen: eine bereits belastbar
//   gespeicherte Region wird NIE durch leer/unbekannt ersetzt.
function classifyKnowledgeObject(ko = {}, ai = {}, opts = {}) {
  const aiLevel = LEVELS.includes(ai.decision_level) ? ai.decision_level : null;
  const derived = deriveDecisionLevel(ko);
  // Frische Ermittlung dieses Laufs — Herkunft explizit, damit das Gedaechtnis
  // eine KI-Aussage von einer regelbasierten Ableitung unterscheiden kann.
  const neu = aiLevel
    ? { level: aiLevel, quelle: "ki", konfidenz: "high" }
    : { level: derived.level, quelle: "deriver", konfidenz: derived.confidence };
  const ebene = entscheideEbene({ bestand: opts.bestand || null, neu, jetzt: opts.jetzt || null });
  const decision_level = ebene.ebene;
  const levelConf = ebene.konfidenz;

  const related_levels = uniqLevels([
    ...(Array.isArray(ai.related_levels) ? ai.related_levels.filter((l) => LEVELS.includes(l)) : []),
    ...deriveRelatedLevels(ko, decision_level)
  ]).filter((l) => l !== decision_level);

  // --- SPRINT 20: Geografie getrennt von der Ebene ---------------------------
  // Die Ebene wird dem Geografie-Resolver BEWUSST NICHT uebergeben. Aus
  // decision_level entsteht keine Geografie mehr — weder Deutschland noch ein
  // Bundesland. Bleibt die Region unbekannt, bleibt sie ehrlich leer.
  const geo = entscheideGeografien({
    bestand: opts.bestand || null,
    kandidaten: sammleGeografieKandidaten(ko, ai, opts),
    jetzt: opts.jetzt || null
  });
  const affected_geographies = geo.betroffen;
  const mentioned_geographies = geo.erwaehnt;

  const decision_entities = buildDecisionEntities(ko);
  const related_entities = buildRelatedEntities(ko);

  const event_type = EVENT_TYPES.includes(ai.event_type) && ai.event_type !== "unknown"
    ? ai.event_type : deriveEventType(ko);

  // Herkunft, Zeitpunkt und Wiederverwendung der Ebene wandern additiv in das
  // bereits vorhandene jsonb (KEINE neue Spalte, KEINE Migration). Damit ist im
  // Datensatz selbst nachweisbar, WANN die Ebene erstmals ermittelt wurde und ob
  // dieser Lauf sie wiederverwendet hat.
  //
  // SPRINT 20 ergaenzt dieselbe Mechanik fuer die Geografie: Herkunft, Zeitpunkt
  // der Erstermittlung, Wiederverwendung — und die Quellengeografie als reines
  // INDIZ (geography_indizien). Die Quellengeografie wird damit ausdruecklich
  // NICHT als betroffene Geografie gespeichert und auch nicht als zweite
  // Geografiestruktur dupliziert; sie bleibt kanonisch am Abrufweg
  // (source_packages.geography_id / path_expected_geographies).
  const classification_confidence = {
    level: levelConf,
    // EHRLICHE KENNZAHL (Sprint 20): vorher zaehlte hier die Zahl der ERWAEHNTEN
    // Orte als "Geografie-Konfidenz" — eine Erwaehnung ist aber kein Beleg fuer
    // Betroffenheit. Massgeblich ist die Belegstaerke der BETROFFENEN Geografie.
    geography: geografieKonfidenz(geo),
    entities: decision_entities.length || related_entities.length ? "medium" : "low",
    event_type: event_type === "unknown" ? "low" : "medium",
    level_quelle: ebene.quelle,
    level_ermittelt_am: ebene.ermittelt_am,
    level_wiederverwendet: ebene.wiederverwendet,
    geography_quelle: geo.quelle,
    geography_ermittelt_am: geo.ermittelt_am,
    geography_wiederverwendet: geo.wiederverwendet,
    geography_indizien: geo.indizien
  };

  return {
    decision_level,
    // Nicht persistiert, aber fuer Aufrufer/Telemetrie: wie diese Ebene zustande kam.
    level_entscheidung: ebene,
    // Ebenso fuer Aufrufer/Telemetrie: wie die Geografie zustande kam.
    geografie_entscheidung: geo,
    related_levels,
    affected_geographies,
    mentioned_geographies,
    decision_entities,
    related_entities,
    event_type,
    classification_confidence
  };
}

// --- SPRINT 20: Geografie-Kandidaten sammeln --------------------------------
//
// ERSETZT `deriveAffectedGeographies(level, mentionedGeos)`. Die alte Funktion
// erzeugte die betroffene Geografie ALLEIN aus der politischen Ebene:
// 'bund' -> Deutschland, 'eu' -> Europaeische Union, 'land' ohne erkanntes
// Bundesland -> ebenfalls Deutschland. Damit war jede Aussage ueber das WO in
// Wahrheit eine Aussage ueber das WER — und ein Vorgang, dessen Region schlicht
// unbekannt war, wurde als "betrifft Deutschland" gespeichert.
//
// Neu: die Ebene fliesst hier NICHT MEHR EIN. Diese Funktion bekommt sie nicht
// einmal uebergeben. Betroffenheit entsteht ausschliesslich aus Nachweisen.
//
// opts (alle optional):
//   opts.strukturiert     — Ergebnisse eines spezialisierten Parlamentsparsers
//                           (pardok-parser.js: `geografie`/`politische_ebene`).
//                           Herkunft 'parser'. Berlin/Brandenburg sind bewusst
//                           inaktiv -> heute unbefuellt, die Aufnahme ist
//                           verdrahtet und getestet.
//   opts.amtlich          — eindeutige amtliche Geo-Metadaten. Herkunft 'amtlich'.
//   opts.quellenGeografien— Geografie des Abrufwegs/Herausgebers. NUR INDIZ:
//                           strukturell davon ausgeschlossen, eine betroffene
//                           Geografie zu werden (geografie-gedaechtnis.js).
function sammleGeografieKandidaten(ko = {}, ai = {}, opts = {}) {
  const kandidaten = [];

  // 1) Parlamentsparser (staerkster Nachweis).
  for (const roh of asListe(opts.strukturiert)) {
    const g = geoAusReferenz(roh);
    if (g) kandidaten.push({ ...g, herkunft: "parser", rolle: "betroffen" });
  }

  // 2) Eindeutige amtliche Metadaten.
  for (const roh of asListe(opts.amtlich)) {
    const g = geoAusReferenz(roh);
    if (g) kandidaten.push({ ...g, herkunft: "amtlich", rolle: "betroffen" });
  }

  // 3) Explizite inhaltliche Aussage: eine im Vorgang genannte SUBNATIONALE
  //    Institution aus dem kanonischen Entitaetenkatalog, deren Bezeichnung die
  //    Region mitnennt. "Abgeordnetenhaus von Berlin" ist ein Beleg fuer Berlin —
  //    die blosse Ortsnennung "Berlin" ist es ausdruecklich NICHT (Regel 5), und
  //    ein regionloses "Senatskanzlei" ebenso wenig (Regel 3).
  //    Beide Fundorte zaehlen: die strukturierten Listen UND der Fliesstext —
  //    reale Meldungen nennen die Landesinstitution meist nur in der Schlagzeile.
  const institutionsNennungen = [
    ...(ko.ausschuesse || []), ...(ko.ministerien || []),
    ...(ko.mentioned_committees || []), ...(ko.mentioned_ministries || []),
    ...(ko.mentioned_organizations || [])
  ];
  for (const bezeichnung of institutionsNennungen) {
    const g = geografieAusInstitutionsnennung(bezeichnung);
    if (g) kandidaten.push({ ...g, herkunft: "inhalt", rolle: "betroffen" });
  }
  for (const g of geografienAusText(ko)) {
    kandidaten.push({ ...g, herkunft: "inhalt", rolle: "betroffen" });
  }

  // 4) Bestehende strukturierte KI-Analyse — aus dem OHNEHIN stattfindenden
  //    Understanding-Call. KEIN zusaetzlicher KI-Aufruf (Regel 10): dieses Feld
  //    steht seit Sprint 2 im Antwortschema und wurde bisher schlicht verworfen.
  for (const g of resolveGeographies(namenAus(ai.affected_geographies))) {
    kandidaten.push({ ...g, herkunft: "ki", rolle: "betroffen" });
  }

  // 5) Erwaehnungen. Erzeugen NIE eine Betroffenheit.
  for (const g of resolveGeographies([
    ...namenAus(ai.mentioned_geographies),
    ...(Array.isArray(ko.mentioned_locations) ? ko.mentioned_locations : [])
  ])) {
    kandidaten.push({ ...g, herkunft: "erwaehnung", rolle: "erwaehnt" });
  }

  // 6) Quellengeografie — nur Indiz.
  for (const roh of asListe(opts.quellenGeografien)) {
    const g = geoAusReferenz(roh);
    if (g) kandidaten.push({ ...g, herkunft: "quelle", rolle: "quelle" });
  }

  return kandidaten;
}

function asListe(wert) {
  return Array.isArray(wert) ? wert : (wert ? [wert] : []);
}

// Eine Referenz (kanonische ID, Objekt mit geography_id oder blosser Name) auf
// einen kanonischen Geografie-Datensatz aufloesen. Regel 7: gespeichert wird
// ueber kanonische Datensaetze, nicht als unkontrollierte Textvariante. Ein
// unaufloesbarer Name bleibt ehrlich mit geography_id = null erhalten.
function geoAusReferenz(roh) {
  if (!roh) return null;
  if (typeof roh === "string") {
    const direkt = GEO_BY_ID.get(roh);
    if (direkt) return { name: direkt.name, level: direkt.level, geography_id: direkt.id };
    return resolveGeography(roh);
  }
  if (typeof roh !== "object") return null;
  const id = roh.geography_id || roh.geografie || null;
  if (id) {
    const treffer = GEO_BY_ID.get(String(id));
    if (treffer) return { name: treffer.name, level: treffer.level, geography_id: treffer.id };
  }
  if (roh.name) return resolveGeography(roh.name);
  return null;
}

// Aus einer KI-gelieferten Geo-Liste nur die Namen ziehen; die Aufloesung gegen
// den kanonischen Seed macht resolveGeographies. Eine von der KI erfundene
// geography_id wird damit NIE uebernommen.
function namenAus(liste) {
  return (Array.isArray(liste) ? liste : [])
    .map((e) => (e && typeof e === "object" ? e.name : e))
    .filter((n) => typeof n === "string" && n.trim());
}

function uniqLevels(list) {
  return [...new Set(list)];
}

module.exports = {
  LEVELS, CONF, EVENT_TYPES,
  normText,
  resolveGeography, resolveGeographies,
  resolveEntity, resolveEntities,
  deriveDecisionLevel, deriveRelatedLevels, deriveEventType,
  buildDecisionEntities, buildRelatedEntities,
  // Sprint 20: Geografie-Kandidaten (ohne jede Ebenen-Ableitung).
  sammleGeografieKandidaten, geoAusReferenz, subnationaleGeografieVonEntitaet,
  geografieAusInstitutionsnennung, geografienAusText, bezeichnungNenntGeografie,
  GEO_TRAGENDE_ENTITAETSTYPEN, SUBNATIONALE_INSTITUTIONSPHRASEN,
  classifyKnowledgeObject
};
