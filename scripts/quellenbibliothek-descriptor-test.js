"use strict";

// Tests der universellen Quellenbibliothek · Deskriptor + Parser-Registry + Registry-Dedup.
// REINE LOGIK, synthetische Fixtures, kein Netz/KI/Storage. Deckt ab:
//   - Deskriptor-Normalisierung + Validierung (Vertrag, alle Pflichtdimensionen)
//   - kanonischer Dedup-Schlüssel (www/Tracking/Google-News-Suche)
//   - Parser Registrierung (Registry, Methodenkompatibilität, Konflikt)
//   - Registry: globale Dedup (identische Quelle genau EINMAL)

const { normalizeDescriptor, validateDescriptor, canonicalKey } = require("../lib/helmut/quellenbibliothek/descriptor");
const { ParserRegistry, createDefaultRegistry } = require("../lib/helmut/quellenbibliothek/parsers");
const { SourceRegistry } = require("../lib/helmut/quellenbibliothek/registry");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- 1) Normalisierung ------------------------------------------------------
const d1 = normalizeDescriptor({
  publisher: "BMAS", name: "BMAS Presse",
  access: { method: "feed", url: "https://www.bmas.de/rss.xml?utm_source=x" },
  themen: ["Arbeit und Soziales", "Pflege"], party: "Die LINKE",
  level: "bund", trust: "hoch", license: "open", expectedFrequency: "daily"
});
check("1a method-Alias feed->rss", d1.access.method === "rss");
check("1b Themen normalisiert (slug, sortiert)", JSON.stringify(d1.topics) === JSON.stringify(["arbeit-und-soziales", "pflege"]));
check("1c Partei normalisiert", d1.parties.includes("linke"));
check("1d Listenfelder nie undefined", Array.isArray(d1.factions) && Array.isArray(d1.regions) && Array.isArray(d1.ministries));
check("1e id fällt auf canonicalKey zurück", d1.id === d1.canonicalKey && !!d1.canonicalKey);
check("1f Default-Status prepared, license open übernommen", d1.status === "prepared" && d1.license === "open");

// --- 2) Kanonischer Dedup-Schlüssel ----------------------------------------
const a = normalizeDescriptor({ publisher: "X", access: { method: "rss", url: "https://www.example.com/feed?utm_medium=a" }, topics: ["t"] });
const b = normalizeDescriptor({ publisher: "X", access: { method: "rss", url: "https://example.com/feed" }, topics: ["t"] });
check("2a www + Tracking dedupliziert zum selben Schlüssel", a.canonicalKey === b.canonicalKey, `${a.canonicalKey} vs ${b.canonicalKey}`);

const g1 = normalizeDescriptor({ publisher: "Verdi", access: { method: "googlenews_search", url: "https://news.google.com/rss/search?q=site:verdi.de%20Tarif" }, topics: ["tarif"] });
const g2 = normalizeDescriptor({ publisher: "Verdi", access: { method: "search", provider: "google_news", query: "site:verdi.de Tarif" }, topics: ["tarif"] });
check("2b Google-News-Suche: URL- und Query-Form dedupliziert über site:-Domain", g1.canonicalKey === g2.canonicalKey, `${g1.canonicalKey} vs ${g2.canonicalKey}`);
check("2c verschiedene site:-Domains sind verschiedene Quellen",
  canonicalKey({ access: { method: "search", query: "site:verdi.de x" } }) !== canonicalKey({ access: { method: "search", query: "site:dgb.de x" } }));

// --- 3) Validierung (Vertrag) ----------------------------------------------
check("3a gültige Quelle ok", validateDescriptor(d1).ok);
check("3b publisher-Pflicht", validateDescriptor({ access: { method: "rss", url: "https://x.de/f" }, topics: ["t"] }).errors.includes("publisher-fehlt"));
check("3c abruf-url-Pflicht (nicht-search)", validateDescriptor({ publisher: "X", access: { method: "rss" }, topics: ["t"] }).errors.includes("abruf-url-fehlt"));
check("3d search braucht Suchdefinition", validateDescriptor({ publisher: "X", access: { method: "search" }, topics: ["t"] }).errors.includes("suchdefinition-fehlt"));
check("3e ohne Zuordnungsdimension abgelehnt", validateDescriptor({ publisher: "X", access: { method: "rss", url: "https://x.de/f" } }).errors.includes("keine-zuordnungsdimension"));
check("3f universal genügt als Dimension", validateDescriptor({ publisher: "X", access: { method: "rss", url: "https://x.de/f" }, universal: true }).ok);
check("3g Warnungen: unbekannte Lizenz/Vertrauen/Parser", (() => {
  const v = validateDescriptor({ publisher: "X", access: { method: "rss", url: "https://x.de/f" }, topics: ["t"] });
  return v.ok && v.warnings.includes("vertrauensniveau-unbekannt") && v.warnings.includes("parser-nicht-gesetzt");
})());

// --- 4) Parser Registrierung -----------------------------------------------
const reg = createDefaultRegistry();
check("4a Standard-Parser registriert", reg.has("generic_rss") && reg.has("structured_download"));
check("4b Registrierung neuer Parser", (() => { reg.register("oparl_json", { methods: ["api"], description: "OParl" }); return reg.has("oparl_json"); })());
check("4c idempotente Re-Registrierung identisch ok", (() => { try { reg.register("oparl_json", { methods: ["api"], description: "OParl" }); return true; } catch { return false; } })());
check("4d Konflikt bei abweichender Definition wirft", (() => { try { reg.register("oparl_json", { methods: ["rss"] }); return false; } catch { return true; } })());
check("4e unbekannte Methode wird abgelehnt", (() => { try { reg.register("bad", { methods: ["telepathie"] }); return false; } catch (e) { return /methode-unbekannt/.test(e.message); } })());
check("4f supports: RSS-Quelle mit generic_rss ok", reg.supports({ access: { method: "rss", parser: "generic_rss" } }).ok);
check("4g supports: falsche Methode inkompatibel", reg.supports({ access: { method: "api", parser: "generic_rss" } }).reason === "parser-methode-inkompatibel");
check("4h supports: search braucht keinen Parser", reg.supports({ access: { method: "search", query: "x" } }).ok);
check("4i supports: fehlender Parser gemeldet", reg.supports({ access: { method: "rss" } }).reason === "parser-nicht-gesetzt");

// Registry mit Parser-Zwang lehnt Quelle ohne gültigen Parser ab.
const strict = new SourceRegistry({ parsers: reg });
const addBadParser = strict.add({ publisher: "X", name: "X", access: { method: "rss", url: "https://x.de/f", parser: "gibtsnicht" }, topics: ["t"] }, { requireParser: true });
check("4j requireParser: unregistrierter Parser -> rejected", addBadParser.status === "rejected" && /parser/.test(addBadParser.errors[0]));

// --- 5) Registry-Dedup ------------------------------------------------------
const r = new SourceRegistry();
const add1 = r.add({ publisher: "X", name: "X Feed", access: { method: "rss", url: "https://www.x.de/feed" }, topics: ["t"] });
const add2 = r.add({ publisher: "X", name: "X Feed Kopie", access: { method: "rss", url: "https://x.de/feed?utm_source=y" }, topics: ["t"] });
check("5a erste Aufnahme added", add1.status === "added");
check("5b physisch identische Quelle -> duplicate (genau EINMAL)", add2.status === "duplicate" && r.size === 1);
check("5c Dedup zeigt Bestand-Id", add2.existingId === add1.id);

const report = r.addAll([
  { publisher: "Y", name: "Y", access: { method: "rss", url: "https://y.de/f" }, topics: ["t"] },
  { publisher: "Y", name: "Y2", access: { method: "rss", url: "https://y.de/f" }, topics: ["t"] }, // Dublette
  { publisher: "", access: { method: "rss", url: "https://z.de/f" }, topics: ["t"] }              // ungültig
]);
check("5d addAll trennt added/duplicates/rejected", report.added.length === 1 && report.duplicates.length === 1 && report.rejected.length === 1);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Deskriptor/Parser-Assertions`);
process.exit(failed > 0 ? 1 : 0);
