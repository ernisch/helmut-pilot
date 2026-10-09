"use strict";
const A = require("node:assert/strict");
const E = require("../lib/helmut/briefing-ereignisgruppen");
const Aussagen = require("../lib/helmut/briefing-aussagenbindung");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
// Synthetische Darstellungsfixtures sind keine Produktionsbescheinigung.
const plan = { id: "ereignis-synthetisch", mitglieder: [
  { koId: "ko-a", vorgangId: "vg-a", quelleId: "quelle-a" },
  { koId: "ko-b", vorgangId: "vg-b", quelleId: "quelle-b" }
] };
const items = [
  { id: "item-a", knowledgeObjectId: "ko-a", vorgangId: "vg-a", title: "Bericht A",
    summary: "Artikel A trägt allein die Zahl vier.", sources: [{ url: "https://example.org/a" }] },
  { id: "item-unverwandt", knowledgeObjectId: "ko-u", vorgangId: "vg-u", title: "Bericht A" },
  { id: "item-b", knowledgeObjectId: "ko-b", vorgangId: "vg-b", title: "Bericht B",
    summary: "Artikel B beschreibt allein die Option.", sources: [{ url: "https://example.org/b" }] }
];
const recommendations = items.map(i => ({ knowledge_object_id: i.knowledgeObjectId,
  vorgang_id: i.vorgangId, title: i.title, recommended_action: "Beleg " + i.vorgangId }));
const apply = more => E.gruppiereAusgaben({ items, recommendations, plan, ...more });
test("Ein Ereignispunkt bewahrt vollständige Mitglieder und getrennte Quellen", () => {
  const before = JSON.stringify({ items, recommendations, plan });
  const out = apply();
  A.equal(out.items.length, 2); A.equal(out.recommendations.length, 2);
  A.strictEqual(out.items[1], items[1]);
  A.deepEqual(out.items[0].ereignisMitglieder.map(({ quellenIds, ...i }) => i), [items[0], items[2]]);
  A.deepEqual(out.recommendations[0].ereignisMitglieder.map(({ quellenIds, ...r }) => r),
    [recommendations[0], recommendations[2]]);
  A.deepEqual(out.items[0].sources, items[0].sources);
  A.deepEqual(out.items[0].ereignisMitglieder.map(m => m.quellenIds), [["quelle-a"], ["quelle-b"]]);
  A.equal(JSON.stringify({ items, recommendations, plan }), before);
});
test("Bestehender Hauptvorgang und eigenständige Fakten bleiben erhalten", () => {
  const out = apply({ primaryVorgangId: "vg-b" });
  A.equal(out.items[1].knowledgeObjectId, "ko-b");
  A.equal(out.recommendations[1].knowledge_object_id, "ko-b");
  A.equal(out.items[1].summary, items[2].summary);
});
test("Fehlendes Mitglied oder Empfehlung gruppiert nicht", () => {
  for (const more of [{ items: items.slice(0, 2) }, { recommendations: recommendations.slice(0, 2) }]) {
    const out = apply(more); A.strictEqual(out.items, more.items || items);
    A.strictEqual(out.recommendations, more.recommendations || recommendations);
  }
});
test("Doppelte und fremd zugeordnete Ausgabebindungen gruppieren nicht", () => {
  for (const bad of [[...items, items[0]], items.map(i => i === items[2] ? { ...i, vorgangId: "vg-fremd" } : i)]) {
    A.strictEqual(apply({ items: bad }).items, bad);
  }
  A.strictEqual(apply({ recommendations: [...recommendations, recommendations[0]] }).items, items);
  A.strictEqual(apply({ plan: { ...plan, mitglieder: [plan.mitglieder[0], plan.mitglieder[0]] } }).items, items);
});
test("Synthetische Gleichheit oder selbst vergebene Hashpins ergeben keinen Produktionsplan", () => {
  A.equal(E.plane(), null);
  const kosById = Object.fromEntries(items.map(i => [i.knowledgeObjectId,
    { id: i.knowledgeObjectId, vorgang_id: i.vorgangId, headline: "Vier Fregatten", hash: "selbst-vergeben" }]));
  const decisions = recommendations.map(r => ({ knowledge_object_id: r.knowledge_object_id, vorgang_id: r.vorgang_id }));
  A.equal(E.plane({ decisions, kosById, sourcesByVorgang: {} }), null);
  A.strictEqual(apply({ plan: null }).items, items);
});
test("Jedes Mitglied im Tageskopf/Detail verhindert Gruppierung unabhängig von Zeit und Schwelle", () => {
  for (const state of [{ primaryVorgangId: "vg-a" }, { primaryItem: { id: "vg-b" } },
    { primaryItem: { vorgangId: "vg-b" } }, { relatedVorgangIds: ["vg-a"] },
    { items: [{ id: "vg-b" }] }, { items: [{ vorgang_id: "vg-a" }] },
    { items: [{ vorgangId: "vg-b" }] }]) {
    const bound = E.ausserhalbTageskopf(plan, state); A.equal(bound, null);
    A.strictEqual(apply({ plan: bound }).items, items);
  }
  A.strictEqual(E.ausserhalbTageskopf(plan, { primaryVorgangId: "vg-u", items: [{ id: "vg-u" }] }), plan);
  A.equal(E.ausserhalbTageskopf(null), null);
});
test("Tatsächlicher Aussagenvertrag bindet Mitglied B an dessen eigene Quelle und sichtbare ID", () => {
  const out = apply();
  const profile = { id: "fiktives-profil", full_name: "Fiktive Person", parliament: "bundestag" };
  const kos = [{ id: "ko-a", vorgang_id: "vg-a" }, { id: "ko-b", vorgang_id: "vg-b" },
    { id: "ko-u", vorgang_id: "vg-u" }];
  const eingabe = Aussagen.baueEingabe({ briefing: { items: out.items, personalizedRecommendations: out.recommendations },
    profile, userId: profile.id, day: "2026-10-09", kos,
    sourcesByVorgang: { "vg-a": [{ id: "quelle-a", url: "https://example.org/a" }],
      "vg-b": [{ id: "quelle-b", url: "https://example.org/b" }] } });
  const aussage = eingabe.aussagen.find(a => a.text === items[2].summary);
  A.ok(aussage); A.equal(aussage.vorgangId, "vg-b"); A.equal(aussage.art, "fachaussage");
  A.ok(eingabe.aussagen.some(a => a.text === recommendations[2].recommended_action && a.vorgangId === "vg-b"));
  A.deepEqual(new Set(eingabe.korrekturKontext.sichtbareVorgaenge), new Set(["vg-a", "vg-b", "vg-u"]));
  A.ok(!eingabe.aussagen.some(a => a.text === plan.id || a.text === "quelle-a" || a.text === "quelle-b"));
});
console.log(`${passed}/${passed} Fallgruppen bestanden`);
