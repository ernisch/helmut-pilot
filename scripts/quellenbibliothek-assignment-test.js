"use strict";

// Tests der automatischen Quellenzuweisung (Auftrag §3) + Gewichtung (§4-Gewichte) +
// Paketbildung (Laufzeit-„Paket" = Zuweisungsergebnis). REINE LOGIK, synthetische
// Fixtures. Deckt die Auftrags-Pflichtfälle ab:
//   - Kriterienbasierte Zuweisung OHNE fest codierte Sonderfälle
//   - Ebenen/Region: Bundesland-übergreifende Regionalquellen sauber getrennt
//   - Gewichtung: Fraktion > Partei > Politikfeld > Ministerium > Region
//   - Paketbildung zur Laufzeit + globale Referenzzählung (100 gleiche Mandate = 1x)
//   - Ausschuss<->Thema-Brücke (Politikfeld) ohne Themenwortliste
//   - Adversarial: kein Mandat, unbrauchbares Mandat, unbekannte Partei/Land, blockiert

const { SourceRegistry } = require("../lib/helmut/quellenbibliothek/registry");
const { deriveRequirement, assignSources, computeGlobalAssignment, scoreSource, DIMENSION_WEIGHTS } = require("../lib/helmut/quellenbibliothek/assignment");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

function buildRegistry() {
  const r = new SourceRegistry();
  r.addAll([
    { id: "bundestag", publisher: "Deutscher Bundestag", name: "Bundestag", access: { method: "rss", url: "https://bundestag.de/rss", parser: "generic_rss" }, universal: true, level: "bund", trust: "hoch", license: "open", evidenceRole: "official_primary", status: "active", priority: 100 },
    { id: "dip", publisher: "DIP", name: "DIP API", access: { method: "api", url: "https://search.dip.bundestag.de/api", parser: "json_api" }, universal: true, level: "bund", trust: "hoch", license: "open", evidenceRole: "official_primary", status: "active", priority: 96 },
    { id: "bmas", publisher: "BMAS", name: "BMAS", access: { method: "rss", url: "https://bmas.de/rss", parser: "generic_rss" }, topics: ["Arbeit und Soziales"], ministries: ["bmas"], level: "bund", trust: "hoch", license: "open", status: "active", priority: 90 },
    { id: "ausschuss-as", publisher: "BT-Ausschuss AuS", name: "Ausschuss Arbeit u. Soziales", access: { method: "rss", url: "https://bundestag.de/ausschuss-as", parser: "generic_rss" }, committees: ["Arbeit und Soziales"], level: "bund", trust: "hoch", license: "open", evidenceRole: "official_primary", status: "active", priority: 88 },
    { id: "linke-bund", publisher: "Die Linke", name: "Die Linke Bund", access: { method: "rss", url: "https://die-linke.de/rss", parser: "generic_rss" }, parties: ["Die Linke"], level: "bund", trust: "mittel", license: "open", evidenceRole: "direct_interest", status: "active", priority: 70 },
    { id: "linksfraktion", publisher: "Fraktion Die Linke", name: "Linksfraktion", access: { method: "search", provider: "google_news", query: "site:linksfraktion.de" }, factions: ["Die Linke"], level: "bund", trust: "mittel", license: "open", evidenceRole: "direct_interest", status: "active", priority: 68 },
    { id: "nds-regional", publisher: "Braunschweiger Zeitung", name: "Regional Niedersachsen", access: { method: "rss", url: "https://bz.de/rss", parser: "generic_rss" }, regions: ["niedersachsen", "braunschweig"], level: "land", trust: "mittel", license: "restricted", status: "active", priority: 60 },
    { id: "bayern-regional", publisher: "BR", name: "Regional Bayern", access: { method: "rss", url: "https://br.de/rss", parser: "generic_rss" }, regions: ["bayern"], level: "land", trust: "hoch", license: "open", status: "active", priority: 60 },
    { id: "verboten", publisher: "Bot-Sperre", name: "Verbotene Quelle", access: { method: "rss", url: "https://verboten.de/rss", parser: "generic_rss" }, topics: ["Arbeit und Soziales"], level: "bund", trust: "mittel", license: "prohibited", status: "active", priority: 50 },
    { id: "archiviert", publisher: "Alt", name: "Archiviert", access: { method: "rss", url: "https://alt.de/rss", parser: "generic_rss" }, topics: ["Arbeit und Soziales"], level: "bund", trust: "mittel", license: "open", status: "archived", priority: 50 }
  ]);
  return r;
}

const reg = buildRegistry();

// --- 1) Zuweisung eines realistischen Mandats -------------------------------
// Bundestagsmandat, Partei+Fraktion Die Linke, Ausschuss Arbeit u. Soziales, Wahlkreis Niedersachsen.
const mandate = { id: "m1", partei: "DIE LINKE", fraktion: "Die Linke", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", politische_ebene: "bundestag" };
const a1 = assignSources(reg, mandate);
const ids1 = a1.sources.map((s) => s.id);
check("1a universale Grundversorgung immer dabei", ids1.includes("bundestag") && ids1.includes("dip"));
check("1b eigene Partei zugewiesen", ids1.includes("linke-bund"));
check("1c eigene Fraktion zugewiesen", ids1.includes("linksfraktion"));
check("1d Ausschuss-Quelle über Politikfeld", ids1.includes("ausschuss-as"));
check("1e Fachthema (BMAS) über Politikfeld-Brücke Ausschuss->Thema", ids1.includes("bmas"), "Ausschuss 'Arbeit und Soziales' matcht topic-getaggte Quelle");
check("1f regionale Quelle Niedersachsen zugewiesen", ids1.includes("nds-regional"));
check("1g fremde Region (Bayern) NICHT zugewiesen", !ids1.includes("bayern-regional"));
check("1h verbotene Lizenz NICHT zugewiesen", !ids1.includes("verboten"));
check("1i archivierte Quelle NICHT zugewiesen", !ids1.includes("archiviert"));

// --- 2) Gewichtung / Reihenfolge -------------------------------------------
// Fraktion (5) > Partei (4) > Politikfeld (3). Höchste spezifische Relevanz oben.
const rankOf = (id) => ids1.indexOf(id);
check("2a Fraktion vor Politikfeld-Quelle", rankOf("linksfraktion") < rankOf("bmas"));
check("2b Partei vor Politikfeld-Quelle", rankOf("linke-bund") < rankOf("ausschuss-as") || a1.sources.find((s) => s.id === "linke-bund").score > a1.sources.find((s) => s.id === "ausschuss-as").score);
check("2c Gewichte fraktion>partei>politikfeld>ministerium>region",
  DIMENSION_WEIGHTS.factions > DIMENSION_WEIGHTS.parties &&
  DIMENSION_WEIGHTS.parties > DIMENSION_WEIGHTS.policyFields &&
  DIMENSION_WEIGHTS.policyFields >= DIMENSION_WEIGHTS.ministries &&
  DIMENSION_WEIGHTS.ministries > DIMENSION_WEIGHTS.regions);
check("2d Score nachvollziehbar (reasons je Quelle)", a1.sources.every((s) => Array.isArray(s.reasons)));
const bmasReasons = a1.sources.find((s) => s.id === "bmas").reasons.map((r) => r.dimension);
check("2e BMAS-Begründung nennt policyFields", bmasReasons.includes("policyFields"));

// --- 3) KEINE fest codierten Sonderfälle -----------------------------------
// Eine unbekannte Partei/ein unbekanntes Land führt NICHT zu Absturz oder Fehlzuweisung,
// sondern zu ehrlich weniger Treffern (nur Grundversorgung). Kein "linke"/"niedersachsen"-Hardcode.
const fremd = assignSources(reg, { id: "m2", partei: "Tierschutzpartei", bundesland: "Saarland", politische_ebene: "bundestag" });
const fremdIds = fremd.sources.map((s) => s.id);
check("3a unbekannte Partei: keine Partei-Quelle, aber Grundversorgung", !fremdIds.includes("linke-bund") && fremdIds.includes("bundestag"));
check("3b unbekanntes Land: keine fremde Regionalquelle", !fremdIds.includes("nds-regional") && !fremdIds.includes("bayern-regional"));
check("3c neue Partei-Quelle wirkt SOFORT ohne Codeänderung", (() => {
  const r2 = buildRegistry();
  r2.add({ id: "tierschutz", publisher: "Tierschutzpartei", name: "Tierschutz", access: { method: "rss", url: "https://tierschutzpartei.de/rss", parser: "generic_rss" }, parties: ["Tierschutzpartei"], level: "bund", trust: "niedrig", license: "open", status: "active" });
  return assignSources(r2, { id: "m2", partei: "Tierschutzpartei", politische_ebene: "bundestag" }).sources.some((s) => s.id === "tierschutz");
})());

// --- 4) Paketbildung + globale Referenzzählung (100 gleiche Mandate = 1x) ---
const many = Array.from({ length: 100 }, (_, i) => ({ ...mandate, id: `m-${i}` }));
const global = computeGlobalAssignment(reg, many);
check("4a 100 gleiche Mandate -> jede Quelle genau EINMAL global", new Set(global.activeSources.map((s) => s.id)).size === global.activeSources.length);
check("4b Referenzzählung: gemeinsame Quelle trägt refCount 100", global.activeSources.find((s) => s.id === "linke-bund").refCount === 100);
check("4c universale Quelle immer aktiv", global.activeSources.some((s) => s.id === "bundestag" && s.universal));
check("4d aktive Quellenmenge = Vereinigung der Einzelzuweisungen", (() => {
  const union = new Set();
  global.perMandate.forEach((m) => m.sources.forEach((s) => union.add(s)));
  return [...union].every((id) => global.activeSources.some((s) => s.id === id));
})());

// --- 5) Ohne Mandat: nur universale (always_on) Grundversorgung -------------
const empty = computeGlobalAssignment(reg, []);
check("5a ohne Mandat laufen NUR universale Quellen", empty.activeSources.every((s) => s.universal) && empty.activeSources.length === 2);
check("5b ohne Mandat KEINE Fach-/Regionalquelle", !empty.activeSources.some((s) => ["bmas", "nds-regional", "linke-bund"].includes(s.id)));

// --- 6) Adversarial: unbrauchbare/leere Mandate -----------------------------
check("6a null-Mandat stürzt nicht ab", (() => { try { return assignSources(reg, null).count >= 0; } catch { return false; } })());
check("6b leeres Mandat -> nur Grundversorgung", (() => {
  const e = assignSources(reg, {});
  return e.sources.length === 2 && e.sources.every((s) => ["bundestag", "dip"].includes(s.id));
})());
check("6c requireUsable: unbrauchbares Mandat bekommt KEINE Zuweisung", (() => {
  const u = assignSources(reg, mandate, { requireUsable: true, usable: false });
  return u.count === 0 && u.reason === "mandat-nicht-aktivierbar";
})());
check("6d unbrauchbares Mandat zählt nicht zur globalen Aktivierung", (() => {
  const g = computeGlobalAssignment(reg, [{ ...mandate, id: "x" }], { usable: false });
  return g.usableMandateCount === 0 && g.activeSources.every((s) => s.universal);
})());

// --- 7) Blockiertes Vertrauen / pausiert -----------------------------------
check("7a trust 'blockiert' nie zugewiesen", (() => {
  const r3 = buildRegistry();
  r3.add({ id: "blk", publisher: "Blk", name: "Blockiert", access: { method: "rss", url: "https://blk.de/rss", parser: "generic_rss" }, parties: ["Die Linke"], level: "bund", trust: "blockiert", license: "open", status: "active" });
  return !assignSources(r3, mandate).sources.some((s) => s.id === "blk");
})());
check("7b pausierte Quelle nie zugewiesen", (() => {
  const r4 = buildRegistry();
  r4.add({ id: "pause", publisher: "P", name: "Pausiert", access: { method: "rss", url: "https://p.de/rss", parser: "generic_rss" }, parties: ["Die Linke"], level: "bund", trust: "hoch", license: "open", status: "paused" });
  return !assignSources(r4, mandate).sources.some((s) => s.id === "pause");
})());

// --- 8) Landtagsmandat: Ebene + Bundesland als Region -----------------------
check("8a Landtagsmandat: Bundesland wird zur Region", deriveRequirement({ politische_ebene: "landtag", bundesland: "Niedersachsen" }).regions.includes("niedersachsen"));
check("8b Landtagsmandat Niedersachsen bekommt Niedersachsen-Regionalquelle", assignSources(reg, { id: "l1", politische_ebene: "landtag", bundesland: "Niedersachsen" }).sources.some((s) => s.id === "nds-regional"));
check("8c Ebene korrekt abgeleitet", deriveRequirement({ politische_ebene: "landtag" }).level === "land" && deriveRequirement({ politische_ebene: "bundestag" }).level === "bund");

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Zuweisungs-Assertions`);
process.exit(failed > 0 ? 1 : 0);
