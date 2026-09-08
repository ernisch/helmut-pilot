"use strict";
const assert = require("node:assert/strict");
const R = require("../lib/helmut/radarState");
const item = (id, url, extra = {}) => ({ documentId: id, sourceUrl: url, title: "Gleicher Titel", vorgangId: "vg-alt", ...extra });
const a = item("a", "https://example.org/meldung?utm_source=feed#teil", { evidence: "Direkte Erwaehnung" });
const input = { mentions: [a], environment: {
  party: [item("b", "https://example.org/meldung", { relationType: "party" })], constituency: [], committees: [] },
  dynamics: [item("b", "https://example.org/meldung", { signalType: "rising" })],
  articles: [item("c", "https://example.org/meldung", { relationTypes: ["mention", "party"] }),
    item("d", "https://example.org/andere-meldung", { relationTypes: ["party"] }),
    item("e", "https://example.org/nur-thema", { relationTypes: ["topic"] })] };
const before = JSON.stringify(input), out = R.ordneArtikelEinmal(input);
assert.equal(JSON.stringify(input), before, "Rohzuordnungen werden nicht geaendert");
assert.equal(out.mentions.length, 1); assert.equal(out.environment.party.length, 0);
assert.equal(out.dynamics.length, 0); assert.equal(out.articles.length, 1);
assert.deepEqual(out.mentions[0].relationTypes, ["mention", "party"]);
assert.equal(out.articles[0].documentId, "d", "gleicher Titel/Vorgang allein ist keine Dublette");
const bridge = R.ordneArtikelEinmal({ mentions: [item("a", "https://example.org/a")],
  environment: { party: [item("b", "https://example.org/b")], committees: [], constituency: [] },
  articles: [item("b", "https://example.org/a", { relationTypes: ["party"] })] });
assert.equal(bridge.mentions.length, 1); assert.equal(bridge.environment.party.length, 0);
assert.equal(bridge.articles.length, 0, "Doppelte Dokumentkennung und URL werden gemeinsam aufgeloest");
const distinct = R.ordneArtikelEinmal({ articles: [
  item("a", "https://example.org/artikel?id=1", { relationTypes: ["mention"] }),
  item("b", "https://example.org/artikel?id=2", { relationTypes: ["mention"] })] });
assert.equal(distinct.articles.length, 2, "inhaltliche URL Parameter bleiben erhalten");
console.log("11/11 Radar Anzeigepruefungen bestanden");
