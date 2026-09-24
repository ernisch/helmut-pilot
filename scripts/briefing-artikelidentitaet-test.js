"use strict";

// Synthetische Regression des belegten WELT Variantenfehlers. Keine privaten Daten.
const A = require("node:assert/strict");
const B = require("../lib/helmut/briefingContract");
const D = require("../lib/helmut/dedup");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const url = slug => `https://www.welt.de/politik/deutschland/article${id}/${slug}.html`;
const docs = [
  { id: "rd-a", url: url("erste-fassung"), title: "Erste Überschrift", summary: "Erster Belegtext.",
    source_name: "WELT", link_type: "direct", published_at: "2026-09-17T06:00:00Z" },
  { id: "rd-b", url: url("zweite-fassung"), title: "Andere Überschrift", summary: "Anderer Belegtext.",
    source_name: "WELT", link_type: "direct", published_at: "2026-09-15T06:00:00Z" }
];
const ko = { id: "ko-a", vorgang_id: "vg-a", status: "neu", understanding_status: "complete",
  display_title: "Ein Vorgang", display_summary: "Eine unveränderte Zusammenfassung.",
  source_document_count: 2, created_at: "2026-09-17T07:00:00Z", updated_at: "2026-09-17T07:10:00Z" };
const decision = { knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id, score: 70,
  decision: "Sofort reagieren", priority_type: "action", matched_features: [], risk: "", chance: "" };
const make = (sources, extra = {}) => B.toBriefingContractV3({ profile: { id: "test-artikel" },
  decisions: [decision], kosById: { [ko.id]: ko }, sourcesByVorgang: { [ko.vorgang_id]: sources },
  now: new Date("2026-09-17T08:00:00Z"), ...extra });

test("Eine Artikelkennung zaehlt einmal und erhaelt beide Varianten ohne erfundenes Datum", () => {
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
  A.deepEqual(B.buildSources(ko, docs), sources);
});

test("Andere Artikelkennungen, Anbieter und aehnliche URLs bleiben getrennt", () => {
  for (const secondUrl of [url("gleich").replace(id, "bbbbbbbbbbbbbbbbbbbbbbbb"),
    url("gleich").replace("www.welt.de", "example.org"),
    url("gleich").replace("www.welt.de", "welt.de.example.org"),
    url("gleich").replace("www.welt.de", "archiv.welt.de"),
    url("gleich").replace("https:", "http:"),
    url("gleich").replace(id, id + "a"), url("gleich").replace("/article", "/notarticle")]) {
    A.equal(B.buildSources(ko, [docs[0], { ...docs[1], url: secondUrl }]).length, 2);
  }
  A.equal(D.weltArticleIdentity(url("a")), D.weltArticleIdentity(url("b").replace("www.", "")));
  A.equal(D.weltArticleIdentity("javascript:alert(1)"), "");
  A.equal(D.weltArticleIdentity(url("a").replace("https://", "https://user@")), "");
  A.equal(D.weltArticleIdentity(url("a").replace("welt.de/", "welt.de:1234/")), "");
  const mixed = [{ ...docs[0], url: docs[0].url.replace("https:", "http:") }, docs[1]];
  A.equal(B.oeffnendeHelmutQuelle(ko, mixed).url, docs[1].url);
});

test("Rohdaten Identitaeten und echte Links werden nicht umgeschrieben", () => {
  A.notEqual(D.canonicalizeUrl(docs[0].url), D.canonicalizeUrl(docs[1].url));
  A.notEqual(D.contentHash(docs[0]), D.contentHash(docs[1]));
  const row = D.toRawDocumentRow(docs[0]);
  A.equal(row.url, docs[0].url);
  A.equal(row.canonical_url, D.canonicalizeUrl(docs[0].url));
});

test("Gleicher Zeitpunkt in unterschiedlichen Zeitzonen erzeugt keinen Konflikt", () => {
  const s = B.buildSources(ko, [docs[0], { ...docs[1], published_at: "2026-09-17T08:00:00+02:00" }])[0];
  A.equal(s.publishedAt, docs[0].published_at);
  A.equal(s.publishedAtConflict, false);
  A.equal(s.variants.length, 2);
});

test("Fehlende Zeit wird nicht erfunden und ein einzelner Beleg bleibt bytegleich", () => {
  const s = B.buildSources(ko, docs.slice(0, 1));
  A.deepEqual(s, [{ name: "WELT", title: docs[0].title, summary: docs[0].summary,
    url: docs[0].url, linkType: "direct", sourceType: null, publishedAt: docs[0].published_at }]);
  const empty = B.buildSources(ko, docs.map(d => ({ ...d, published_at: null })))[0];
  A.equal(empty.publishedAt, null);
  A.equal(empty.publishedAtConflict, false);
  const partly = B.buildSources(ko, [{ ...docs[0], published_at: null }, docs[1]])[0];
  A.equal(partly.publishedAt, docs[1].published_at);
  A.equal(partly.publishedAtConflict, false);
  A.equal(B.buildSources({ best_source_url: docs[0].url })[0].publishedAt, null);
  A.deepEqual(B.buildSources({}, []), []);
});

test("Briefing und Detailstand zaehlen Artikel, alle Rohbeleg IDs bleiben erhalten", () => {
  const b = make(docs);
  A.equal(b.items[0].sourceCount, 1);
  A.equal(b.personalizedRecommendations[0].source_count, 1);
  A.equal(b.currentHelmutState.primaryItem, null, "Widersprüchliche Datierung trägt keinen Tagesanlass");
  A.equal(b.items[0].primarySource.publishedAt, null);
  A.equal(b.items[0].primarySource.variants.length, 2);
  A.equal(b.items[0].summary, ko.display_summary);
  A.equal(b.items[0].finalScore, decision.score);
});

test("Widerspruch wird weder durch Analysezeit noch Ersterfassung zu heutiger Frische", () => {
  for (const extra of [{}, { frischeFenster: { start: "2026-09-16T05:00:00Z", end: "2026-09-17T08:00:00Z" } }]) {
    const s = make(docs, extra).currentHelmutState;
    A.equal(s.primaryItem, null);
    A.equal(s.status, "empty");
  }
});

test("Ein anderer widerspruchsfreier Artikel kann den Meldungszeitpunkt belegen", () => {
  const other = { ...docs[0], id: "rd-c", url: "https://example.org/bericht", published_at: "2026-09-17T06:00:00Z" };
  const b = make([...docs, other]);
  A.equal(b.items[0].sourceCount, 2);
  A.equal(b.currentHelmutState.primaryItem.sourceCount, 2);
  A.equal(b.currentHelmutState.primaryItem.meldungAt, other.published_at);
  A.equal(b.currentHelmutState.datenstandVonHeute, true);
});

test("Eingabereihenfolge waehlt keine der widerspruechlichen Zeiten aus", () => {
  const s = B.buildSources(ko, [...docs].reverse())[0];
  A.equal(s.publishedAt, null);
  A.equal(s.publishedAtConflict, true);
  A.equal(s.variants.length, 2);
});

test("Auch gleiche Links erhalten verschiedene Rohbeleg IDs und alle Zeitbelege", () => {
  const pair = [docs[0], { ...docs[1], url: docs[0].url }];
  const source = B.buildSources(ko, pair)[0];
  A.deepEqual(source.variants.map(v => v.documentId), ["rd-a", "rd-b"]);
  A.equal(source.publishedAt, null);
  A.equal(source.publishedAtConflict, true);
  const missing = make(docs.map(d => ({ ...d, published_at: null }))).currentHelmutState;
  A.equal(missing.primaryItem, null);
  A.equal(missing.status, "empty");
});

test("Konfliktquelle verdraengt keinen anderen Schwerpunkt als angeblich frischer Kandidat", () => {
  const top = { ko: { ...ko, id: "ko-top", vorgang_id: "vg-top" }, d: { ...decision, score: 90 },
    docs: [{ ...docs[0], url: "https://example.org/alt", published_at: "2026-09-15T06:00:00Z" }], quality: "valid" };
  const candidate = { ko, d: decision, docs, quality: "valid" };
  const selected = B.selectFreshAwarePrimary([top, candidate], new Date("2026-09-17T08:00:00Z"));
  A.equal(selected.primary, top);
  A.equal(selected.displaced, null);
});

console.log(`${passed}/${passed} Artikelgruppen erfolgreich`);
