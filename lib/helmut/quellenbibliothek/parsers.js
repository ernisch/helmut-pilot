"use strict";

// Helmut — Universelle Quellenbibliothek · Parser-Registry.
//
// Eine Quelle referenziert ihren Parser NUR über einen Schlüssel (`access.parser`).
// Die Registry ist die EINE Stelle, an der ein Schlüssel auf eine konkrete
// Parser-Fähigkeit (unterstützte Methoden) gebunden wird — so gibt es keine fest
// verdrahteten Parser-Sonderfälle in der Zuweisungs-/Crawl-Logik, und neue
// Parlamente/Behörden lassen sich durch REGISTRIERUNG statt Code-Änderung ergänzen.
//
// Reine Registrierung/Verifikation. KEIN echtes Parsen hier (das lebt in den
// vorhandenen Parser-Modulen, z. B. quellenarchitektur/pardok-parser.js). Diese
// Registry validiert nur, dass ein Deskriptor einen bekannten, methodenkompatiblen
// Parser trägt — Grundlage für "Parser Registrierung" (Auftrag §9).

const { RETRIEVAL_METHODS } = require("./descriptor");

class ParserRegistry {
  constructor() {
    /** @type {Map<string,{key:string,methods:string[],handler:?Function,description:string}>} */
    this._parsers = new Map();
  }

  // Registriert einen Parser. Idempotent bei gleicher Definition; wirft bei Konflikt.
  register(key, { methods = [], handler = null, description = "" } = {}) {
    const k = String(key || "").trim();
    if (!k) throw new Error("parser-key-fehlt");
    const badMethod = methods.find((m) => !RETRIEVAL_METHODS.includes(m));
    if (badMethod) throw new Error(`parser-methode-unbekannt:${badMethod}`);
    if (handler != null && typeof handler !== "function") throw new Error("parser-handler-kein-funktion");
    const existing = this._parsers.get(k);
    const def = { key: k, methods: [...new Set(methods)].sort(), handler, description };
    if (existing && JSON.stringify({ ...existing, handler: !!existing.handler }) !== JSON.stringify({ ...def, handler: !!def.handler })) {
      throw new Error(`parser-konflikt:${k}`);
    }
    this._parsers.set(k, def);
    return def;
  }

  has(key) { return this._parsers.has(String(key || "").trim()); }
  get(key) { return this._parsers.get(String(key || "").trim()) || null; }
  list() { return [...this._parsers.values()].sort((a, b) => a.key.localeCompare(b.key)); }

  // Trägt ein Deskriptor einen registrierten, methodenkompatiblen Parser?
  // search-Quellen brauchen keinen Parser (der Aggregator liefert einheitliches RSS).
  supports(descriptor = {}) {
    const access = descriptor.access || {};
    if (access.method === "search") return { ok: true, reason: "search-ohne-parser" };
    const key = String(access.parser || "").trim();
    if (!key) return { ok: false, reason: "parser-nicht-gesetzt" };
    const def = this._parsers.get(key);
    if (!def) return { ok: false, reason: "parser-nicht-registriert" };
    if (def.methods.length && access.method && !def.methods.includes(access.method)) {
      return { ok: false, reason: "parser-methode-inkompatibel" };
    }
    return { ok: true, reason: "ok" };
  }
}

// Standard-Registry mit den generischen Basis-Parsern. Bewusst methoden-, nicht
// herausgeberbezogen: kein Parlament/keine Behörde ist hier hart verdrahtet.
function createDefaultRegistry() {
  const reg = new ParserRegistry();
  reg.register("generic_rss", { methods: ["rss"], description: "Generischer RSS/Atom-Feed-Parser." });
  reg.register("generic_html", { methods: ["html"], description: "Generischer HTML-Listen-/Artikel-Parser." });
  reg.register("json_api", { methods: ["api"], description: "Generischer JSON-API-Parser." });
  reg.register("structured_download", { methods: ["structured_download"], description: "Strukturierter Datei-Download (z. B. PARDOK/OParl)." });
  return reg;
}

module.exports = { ParserRegistry, createDefaultRegistry };
