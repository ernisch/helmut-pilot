"use strict";

// Synthetische Regression: verschiedene Pfadtexte derselben FR Artikelkennung.
const A = require("node:assert/strict");
const B = require("../lib/helmut/briefingContract");
const D = require("../lib/helmut/dedup");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const url = (slug, id = "12345678") => `https://www.fr.de/wirtschaft/${slug}-zr-${id}.html`;
const docs = [
  { id: "rd-fr-a", url: url("erste-fassung"), title: "Erster Titel", summary: "Erster Text.",
    source_name: "Frankfurter Rundschau", link_type: "direct", published_at: "2026-09-17T06:00:00Z" },
  { id: "rd-fr-b", url: url("zweite-fassung"), title: "Zweiter Titel", summary: "Zweiter Text.",
    source_name: "Frankfurter Rundschau", link_type: "direct", published_at: "2026-09-16T06:00:00Z" }
];
const ko = { id: "ko-fr", vorgang_id: "vg-fr", status: "neu", understanding_status: "complete",
  display_title: "Ein Vorgang", display_summary: "Unveränderter Sachtext.", source_document_count: 2,
  created_at: "2026-09-17T07:00:00Z", updated_at: "2026-09-17T07:10:00Z" };
const make = sources => B.toBriefingContractV3({ profile: { id: "test-fr" },
  decisions: [{ knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id, score: 70,
    decision: "Sofort reagieren", priority_type: "action", matched_features: [] }],
  kosById: { [ko.id]: ko }, sourcesByVorgang: { [ko.vorgang_id]: sources },
  now: new Date("2026-09-17T08:00:00Z") });

test("FR Varianten zaehlen einmal und erhalten alle Belegfelder", () => {
  const before = JSON.stringify(docs);
  const sources = B.buildSources(ko, docs);
  A.equal(sources.length, 1);
  A.equal(sources[0].url, docs[0].url);
  A.equal(sources[0].title, docs[0].title);
  A.equal(sources[0].summary, docs[0].summary);
  A.equal(sources[0].publishedAt, null);
  A.equal(sources[0].publishedAtConflict, true);
  A.deepEqual(sources[0].variants.map(s => [s.documentId, s.url, s.title, s.summary, s.publishedAt]),
    docs.map(d => [d.id, d.url, d.title, d.summary, d.published_at]));
  A.equal(JSON.stringify(docs), before);
});

test("Nur exakter Herausgeber und belegtes HTTPS Format tragen die Identitaet", () => {
  for (const invalid of [url("anders", "87654321"), url("anders", "1234567"), url("anders", "123456789"),
    url("anders").replace("-zr-", "-"), url("anders").replace(".html", ".html/weiter"),
    url("anders").replace(".html", ".htm"), url("anders").replace("https:", "http:"),
    url("anders").replace("www.fr.de", "fr.de.example.org"), url("anders").replace("www.fr.de", "archiv.fr.de"),
    url("anders").replace("www.fr.de", "merkur.de"), url("anders").replace("https://", "https://user@"),
    url("anders").replace("fr.de/", "fr.de:1234/"), "not-a-url"]) {
    A.equal(B.buildSources(ko, [docs[0], { ...docs[1], url: invalid }]).length, 2, invalid);
  }
  A.equal(B.buildSources(ko, [docs[0], { ...docs[1], url: url("anders").replace("www.", "") }]).length, 1);
  A.equal(B.buildSources(ko, [docs[0], { ...docs[1], url: url("anders") + "?utm_source=test#absatz" }]).length, 1);
  const mixed = [{ ...docs[0], url: docs[0].url.replace("https:", "http:") }, docs[1]];
  A.equal(B.oeffnendeHelmutQuelle(ko, mixed).url, docs[1].url);
});

test("Zeiten bleiben widerspruechlich, fehlend oder gleichwertig ohne Ersatzdatum", () => {
  const reversed = B.buildSources(ko, [...docs].reverse())[0];
  A.equal(reversed.url, docs[1].url);
  A.equal(reversed.publishedAt, null);
  A.equal(reversed.publishedAtConflict, true);
  const equal = B.buildSources(ko, [docs[0], { ...docs[1], published_at: "2026-09-17T08:00:00+02:00" }])[0];
  A.equal(equal.publishedAt, docs[0].published_at);
  A.equal(equal.publishedAtConflict, false);
  const missing = B.buildSources(ko, docs.map(d => ({ ...d, published_at: null })))[0];
  A.equal(missing.publishedAt, null);
  A.equal(missing.publishedAtConflict, false);
  A.equal(B.buildSources(ko, [{ ...docs[0], published_at: null }, docs[1]])[0].publishedAt, docs[1].published_at);
});

test("Briefing, Empfehlung und Detailstand teilen Zaehler und ehrlichen Zeitbeleg", () => {
  const b = make(docs), s = b.currentHelmutState;
  A.equal(b.items[0].sourceCount, 1);
  A.equal(b.personalizedRecommendations[0].source_count, 1);
  A.equal(s.primaryItem, null, "Widersprüchliche Datierung trägt keinen Tagesanlass");
  A.equal(b.items[0].summary, ko.display_summary);
  A.equal(b.items[0].finalScore, 70);
  const other = { ...docs[0], id: "rd-fr-c", url: url("dritter", "87654321"), published_at: "2026-09-17T07:00:00Z" };
  const withOther = make([...docs, other]);
  A.equal(withOther.items[0].sourceCount, 2);
  A.equal(withOther.currentHelmutState.primaryItem.meldungAt, other.published_at);
});

test("Andere Herausgeber bleiben getrennt, WELT Vertrag bleibt erhalten", () => {
  const welt = "https://www.welt.de/politik/articleaaaaaaaaaaaaaaaaaaaaaaaa/";
  const extra = [{ ...docs[0], url: welt + "a.html" }, { ...docs[1], url: welt + "b.html" }];
  const sources = B.buildSources(ko, [...docs, ...extra]);
  A.equal(sources.length, 2);
  A.equal(sources[0].variants.length, 2);
  A.equal(sources[1].variants.length, 2);
  A.equal(D.weltArticleIdentity(docs[0].url), "");
});

test("Rohdatenkennungen, Inhalte und einzelne FR Quellen bleiben unveraendert", () => {
  A.notEqual(D.canonicalizeUrl(docs[0].url), D.canonicalizeUrl(docs[1].url));
  A.notEqual(D.contentHash(docs[0]), D.contentHash(docs[1]));
  A.equal(D.toRawDocumentRow(docs[0]).url, docs[0].url);
  A.deepEqual(B.buildSources(ko, docs.slice(0, 1)), [{ name: docs[0].source_name,
    title: docs[0].title, summary: docs[0].summary, url: docs[0].url,
    linkType: "direct", sourceType: null, publishedAt: docs[0].published_at }]);
});

console.log(`${passed}/${passed} Pruefgruppen erfolgreich`);
