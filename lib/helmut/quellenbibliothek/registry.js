"use strict";

// Helmut — Universelle Quellenbibliothek · Registry (die "Quellenfabrik").
//
// In-Memory-Register aller `SourceDescriptor`. Reine Datenstruktur, KEIN Netz/KI/Storage.
// Aufgaben:
//   - Aufnahme mit Normalisierung + Validierung (descriptor.js)
//   - GLOBALE Dedup: eine physisch identische Quelle existiert genau EINMAL
//     (canonicalKey). Doppelte Aufnahmen werden gemeldet, nicht dupliziert.
//   - Dimensionale Indizes (Partei/Fraktion/Ausschuss/Thema/Region/Ministerium/Ebene),
//     damit die Zuweisung eines Mandats in O(Treffer) statt O(alle Quellen) läuft und
//     ohne Sonderfälle skaliert (Bundestag..Kommune..EU).
//
// Die Registry ersetzt konzeptionell die manuell gepflegten `source_packages`:
// Pakete werden zur Laufzeit aus Kriterien GEBILDET (assignment.js), nicht kuratiert.

const { validateDescriptor } = require("./descriptor");

const DIMENSIONS = ["parties", "factions", "committees", "topics", "regions", "ministries"];

class SourceRegistry {
  constructor(opts = {}) {
    /** @type {Map<string,object>} id -> descriptor */
    this._byId = new Map();
    /** @type {Map<string,string>} canonicalKey -> id (Dedup-Index) */
    this._byKey = new Map();
    /** @type {Map<string,Map<string,Set<string>>>} dimension -> value -> Set(id) */
    this._index = new Map(DIMENSIONS.map((d) => [d, new Map()]));
    /** @type {Set<string>} ids der universalen Grundversorgungs-Quellen */
    this._universal = new Set();
    /** @type {ParserRegistry|null} optionaler Parser-Check bei Aufnahme */
    this._parsers = opts.parsers || null;
    // Lizenzstatus, die einen Abruf verbieten (nie zuweisbar).
    this._prohibitedLicenses = new Set(["prohibited"]);
  }

  // Nimmt einen Roh-Deskriptor auf. Standard-add ist DEDUP-SICHER: ist der
  // canonicalKey schon vorhanden, wird KEINE zweite Quelle angelegt (Rückgabe
  // "duplicate", Bestand bleibt). Ein bewusstes Ersetzen läuft über { update:true }
  // (siehe update()). Rückgabe:
  //   { status:"added"|"updated"|"duplicate"|"rejected", id, canonicalKey, errors, warnings, existingId }
  add(raw, { requireParser = false, update = false } = {}) {
    const { ok, errors, warnings, descriptor } = validateDescriptor(raw);
    if (!ok) return { status: "rejected", id: null, canonicalKey: descriptor.canonicalKey, errors, warnings };

    if (requireParser && this._parsers) {
      const p = this._parsers.supports(descriptor);
      if (!p.ok) return { status: "rejected", id: descriptor.id, canonicalKey: descriptor.canonicalKey, errors: [`parser:${p.reason}`], warnings };
    }

    const existingId = this._byKey.get(descriptor.canonicalKey);
    if (existingId && !update) {
      // Physisch identische Quelle bereits vorhanden -> idempotent, KEINE zweite Aufnahme.
      return { status: "duplicate", id: existingId, existingId, canonicalKey: descriptor.canonicalKey, errors: [], warnings };
    }
    if (existingId && update) this._unindex(this._byId.get(existingId)); // bewusster Ersatz
    if (this._byId.has(descriptor.id)) this._unindex(this._byId.get(descriptor.id));

    this._byId.set(descriptor.id, descriptor);
    this._byKey.set(descriptor.canonicalKey, descriptor.id);
    this._reindex(descriptor);
    return { status: existingId ? "updated" : "added", id: descriptor.id, canonicalKey: descriptor.canonicalKey, errors: [], warnings };
  }

  // Bewusstes Ersetzen/Aktualisieren einer vorhandenen Quelle (z. B. Health einspielen).
  update(raw, opts = {}) { return this.add(raw, { ...opts, update: true }); }

  // Health-Record einer vorhandenen Quelle setzen (Gesundheitsmotor -> Registry).
  setHealth(id, health) {
    const d = this._byId.get(id);
    if (!d) return false;
    d.health = health;
    return true;
  }

  // Bequeme Mehrfachaufnahme mit Sammelbericht.
  addAll(rawList = [], opts = {}) {
    const report = { added: [], duplicates: [], rejected: [] };
    for (const raw of rawList) {
      const r = this.add(raw, opts);
      if (r.status === "added") report.added.push(r.id);
      else if (r.status === "duplicate") report.duplicates.push({ id: r.existingId, canonicalKey: r.canonicalKey });
      else report.rejected.push({ canonicalKey: r.canonicalKey, errors: r.errors });
    }
    return report;
  }

  get(id) { return this._byId.get(id) || null; }
  getByKey(key) { const id = this._byKey.get(key); return id ? this._byId.get(id) : null; }
  has(id) { return this._byId.has(id); }
  get size() { return this._byId.size; }
  all() { return [...this._byId.values()]; }
  universalSources() { return [...this._universal].map((id) => this._byId.get(id)); }

  // Alle ids, die einen Wert in einer Dimension tragen (leer, wenn keiner).
  idsFor(dimension, value) {
    const dim = this._index.get(dimension);
    if (!dim) return [];
    const set = dim.get(value);
    return set ? [...set] : [];
  }

  remove(id) {
    const d = this._byId.get(id);
    if (!d) return false;
    this._unindex(d);
    this._byId.delete(id);
    if (this._byKey.get(d.canonicalKey) === id) this._byKey.delete(d.canonicalKey);
    return true;
  }

  // Ist diese Quelle grundsätzlich abrufbar (Status + Lizenz)? Von der Zuweisung genutzt.
  isEligible(descriptor = {}) {
    if (!descriptor) return false;
    if (descriptor.status === "archived" || descriptor.status === "paused") return false;
    if (this._prohibitedLicenses.has(descriptor.license)) return false;
    if (descriptor.trust === "blockiert") return false;
    return true;
  }

  _reindex(d) {
    for (const dim of DIMENSIONS) {
      const map = this._index.get(dim);
      for (const v of d[dim] || []) {
        if (!map.has(v)) map.set(v, new Set());
        map.get(v).add(d.id);
      }
    }
    if (d.universal) this._universal.add(d.id);
  }

  _unindex(d) {
    for (const dim of DIMENSIONS) {
      const map = this._index.get(dim);
      for (const v of d[dim] || []) {
        const set = map.get(v);
        if (set) { set.delete(d.id); if (!set.size) map.delete(v); }
      }
    }
    this._universal.delete(d.id);
  }
}

module.exports = { SourceRegistry, DIMENSIONS };
