"use strict";
const assert = require("node:assert/strict");
const V = require("../lib/helmut/vorgang-identity");
const Q = require("../lib/helmut/briefing-quellenqualitaet");
const source = (id, title, summary = "") => ({ id, title, summary,
  source_name: "Beispielquelle", published_at: "2026-09-10T08:00:00Z" });
const ausweis = source("ausweis", "Digitalisierung: Elektronischer Ausweis auf dem Mobiltelefon",
  "Das Ministerium stellt eine Anwendung zur digitalen Identifikation vor.");
const firma = source("firma", "Digitalisierung: Startup finanziert Steuerberatung",
  "Ein Unternehmen nimmt Kapital auf und kauft Steuerkanzleien.");
const klinik = source("klinik", "Digitalisierung: Gesundheitsamt startet neue Software",
  "Die Kommune erneuert ihre Software fuer Meldungen an das Gesundheitsamt.");

assert.equal(V.docsShareEvent(ausweis, firma).gleich, false,
  "Ein gemeinsames Politikfeld ist kein gemeinsames Ereignis");
assert.equal(V.clusterRawDocuments([ausweis, firma, klinik]).length, 3);
assert.equal(Q.themenrein([ausweis, firma, klinik]), false);
assert.equal(Q.quellengebunden({ display_summary:
  "Ein Startup erhaelt Kapital und das Ministerium stellt einen elektronischen Ausweis vor." }, [ausweis, firma]), false);
const zweitquelle = source("ausweis-zwei", "Elektronischer Ausweis: Ministerium stellt Anwendung vor",
  "Die Anwendung dient der digitalen Identifikation auf dem Mobiltelefon.");
assert.equal(V.docsShareEvent(ausweis, zweitquelle).gleich, true,
  "Konkrete gemeinsame Sachanker bleiben gueltig");
assert.equal(Q.themenrein([ausweis, zweitquelle]), true);
assert.equal(Q.themenrein([ausweis, { ...ausweis, id: "identisch" }]), true);
console.log("7/7 Themenanker: getrennte Ereignisse, gemeinsame Sachanker und identische Belege.");
