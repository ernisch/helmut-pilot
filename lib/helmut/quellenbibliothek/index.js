"use strict";

// Helmut — Universelle Quellenbibliothek (Sprint 2) · Einstiegspunkt.
//
// Bündelt die Bausteine der universellen Quellenbibliothek zu EINER Fassade:
//   descriptor  — strukturierte Quellenbeschreibung (Normalisierung/Validierung)
//   parsers     — Parser-Registry (Parser Registrierung)
//   registry    — die "Quellenfabrik" (Aufnahme, Dedup, Indizes)
//   assignment  — automatische Quellenzuweisung aus dem Mandatsregister (§3)
//   quality     — nachvollziehbares mehrachsiges Qualitätsmodell (§4)
//   health      — Gesundheitsmotor / Zustandsmaschine (§5)
//   discovery   — Discovery-Strategie (§6)
//
// Reine Bibliothek: additiv, ohne Netz/KI/Storage-Write. Sie verändert das
// Live-Verhalten NICHT und ist unabhängig von der bestehenden quellenarchitektur/
// (die das relationale Persistenzmodell + den aktiven Crawl-Pfad stellt).

const types = require("./types");
const descriptor = require("./descriptor");
const parsers = require("./parsers");
const registry = require("./registry");
const assignment = require("./assignment");
const quality = require("./quality");
const health = require("./health-engine");
const discovery = require("./discovery");

// Baut eine gebrauchsfertige Registry (inkl. Standard-Parser-Registry).
function createLibrary(opts = {}) {
  const parserRegistry = opts.parsers || parsers.createDefaultRegistry();
  const reg = new registry.SourceRegistry({ parsers: parserRegistry });
  if (Array.isArray(opts.sources) && opts.sources.length) reg.addAll(opts.sources, opts.addOptions || {});
  return { registry: reg, parsers: parserRegistry };
}

module.exports = {
  types,
  descriptor,
  parsers,
  registry,
  assignment,
  quality,
  health,
  discovery,
  // Bequeme Klassenexporte
  SourceRegistry: registry.SourceRegistry,
  ParserRegistry: parsers.ParserRegistry,
  createLibrary
};
