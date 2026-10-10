"use strict";
const A = require("node:assert/strict");
const E = require("../lib/helmut/briefing-ereignisgruppen");
const Aussagen = require("../lib/helmut/briefing-aussagenbindung");
const fs = require("node:fs");
const vm = require("node:vm");
const { hash } = require("../lib/helmut/briefing-speicher");
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
// Nur den festen Registervertrag prüfen: Die folgenden Objekte sind synthetisch.
// Der abgegrenzte Hash-Stub gilt ausschließlich für ihre unveränderten Inhalte;
// er ersetzt weder echte KO-/Source19-Projektionen noch deren Offline-Nachweis.
function gebundeneRegisterFixture() {
  const members = [
    { koId: "ko-vg-haushaltsausschuss-20260708-6cf862", vorgangId: "vg-haushaltsausschuss-20260708-6cf862",
      koHash: "f9c6917a9adf3ee5d2cff460eb1b812859133174d607a8ea658b5bc8f5ca49ba",
      quelleId: "rd-e116a8d2e36564a8169d128853c3d2fcc3f2b5b45e4573a406db10058807e78d",
      quelleHash: "97e4f458506e2f0758b01020eb5912a8c4255db03480777fc88633d8c4aa0080" },
    { koId: "ko-vg-haushaltsausschuss-20260708-734bcf", vorgangId: "vg-haushaltsausschuss-20260708-734bcf",
      koHash: "17207dce899bbf928496eba0b700dc9e8a630b715918f446c7278a1137e676af",
      quelleId: "rd-5985aa691aebdd2401d9ed12963af89f9aa8ef56a4c04fca781448b73c3dcc32",
      quelleHash: "7ae2f9b4ad2f87b2d5016d22b878d01f73a12bdee018223a1a248ebf9e1d3c6f" }
  ];
  const kosById = Object.fromEntries(members.map(m => [m.koId,
    { id: m.koId, vorgang_id: m.vorgangId, headline: "Synthetische Registerfixture" }]));
  const sourcesByVorgang = Object.fromEntries(members.map(m => [m.vorgangId,
    [{ id: m.quelleId, title: "Synthetische Quellenfixture" }]]));
  const decisions = members.map(m => ({ knowledge_object_id: m.koId, vorgang_id: m.vorgangId }));
  const exactFixtures = new Map(members.flatMap(m => [
    [hash(kosById[m.koId]), m.koHash], [hash(sourcesByVorgang[m.vorgangId][0]), m.quelleHash]
  ]));
  const sandbox = { Map, module: { exports: {} }, require: name => {
    A.equal(name, "./briefing-speicher");
    return { hash: value => exactFixtures.get(hash(value)) || hash(value) };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/helmut/briefing-ereignisgruppen"), "utf8"), sandbox);
  return { register: sandbox.module.exports, members, input: { decisions, kosById, sourcesByVorgang } };
}
test("Aktueller fester n-tv-KO-Pin gruppiert nur mit unveränderten Peer- und Quellenpins", () => {
  const { register, members, input } = gebundeneRegisterFixture();
  const bound = register.plane(input);
  A.ok(bound);
  A.equal(bound.mitglieder[0].koHash, members[0].koHash);
  A.equal(bound.mitglieder[1].koHash, members[1].koHash);
  A.equal(bound.mitglieder[0].quelleHashes.length, 2);
  A.equal(bound.mitglieder[1].quelleHashes, undefined);
  A.ok(register.plane({ ...input, kosById: new Map(Object.entries(input.kosById)) }));
});
test("Beliebige KO-/Quellfeld-Drift und falsche Mitgliedsbindungen bleiben geschlossen", () => {
  const { register, members, input } = gebundeneRegisterFixture();
  for (const member of members) {
    const koDrift = structuredClone(input);
    koDrift.kosById[member.koId].headline += " verändert";
    A.equal(register.plane(koDrift), null);
    const sourceDrift = structuredClone(input);
    sourceDrift.sourcesByVorgang[member.vorgangId][0].published_at = "2026-10-10T00:00:00Z";
    A.equal(register.plane(sourceDrift), null);
    const duplicateSource = structuredClone(input);
    duplicateSource.sourcesByVorgang[member.vorgangId].push(duplicateSource.sourcesByVorgang[member.vorgangId][0]);
    A.equal(register.plane(duplicateSource), null);
    const duplicateDecision = structuredClone(input);
    duplicateDecision.decisions.push(duplicateDecision.decisions.find(d => d.knowledge_object_id === member.koId));
    A.equal(register.plane(duplicateDecision), null);
    const wrongBinding = structuredClone(input);
    wrongBinding.decisions.find(d => d.knowledge_object_id === member.koId).vorgang_id = "vg-fremd";
    A.equal(register.plane(wrongBinding), null);
  }
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

function ankaraFixture(mitMeko = false, mitGkv = false) {
  const members = [
    { koId: "ko-vg-kanzler-20260707-d96896", vorgangId: "vg-kanzler-20260707-d96896",
      koHash: "b331ea98a119559d239f5472c0b2df3fb36aa2c97d5de9335b2d8be7dd7174b7",
      quellen: [
        ["rd-2ded9a718103cfca04fd87f2fad30e36e6fb4fc98729bd0e5ada8fe42c01b9a5", "9525de419dbe7a42e14861860fdf580b9864565de3f52931fd3214e7a6b33a21"],
        ["rd-63a4df3327c1a804217aba53c43a6c9712910815db2f7c8817028599c2b31eee", "de7284d6f4044fb8f1d41f05729e6eadc7962ce23a1692204e05e5cb07a29836"],
        ["rd-66259f7a0696a504d2108e20bb4bf2e56a6abfac012a526cff3b61023ff26f73", "555b72caa1a2085dc4d422ee5fde99b5ee3891e7e04acd32b9cb0b2c4cd78482"] ] },
    { koId: "ko-vg-kanzler-20260708-20b7a7", vorgangId: "vg-kanzler-20260708-20b7a7",
      koHash: "ebcd41c7ba03e295d2c6acb146972694354f631feca74010c5ac1bedddb86874",
      quellen: [["rd-66259f7a0696a504d2108e20bb4bf2e56a6abfac012a526cff3b61023ff26f73", "555b72caa1a2085dc4d422ee5fde99b5ee3891e7e04acd32b9cb0b2c4cd78482"]] }
  ];
  if (mitGkv) members.push(
    { gkv: true, koId: "ko-vg-verfassungsgericht-20260709-9c13ca",
      vorgangId: "vg-verfassungsgericht-20260709-9c13ca",
      koHash: "0d914e108399f6261628e8f0d03b983236f16dfbbacaa13b6bb8da507a2dad05",
      publishedAt: "2026-07-09T07:00:00Z",
      quellen: [["rd-9d214337bfce866a21b36336ba95542042372f325b7f5a62ceb341404c2429bf", "0a8eff48550fd9aca530457113108caab1577ceb5bc8998df809ad26387578a1"]] },
    { gkv: true, koId: "ko-vg-bundesverfassungsgericht-20260713-c425db",
      vorgangId: "vg-bundesverfassungsgericht-20260713-c425db",
      koHash: "a2b89b459d2752687af75bf238448adebebdd859809e1881f03e9bea6adbc8e2",
      publishedAt: "2026-07-13T07:00:00Z",
      quellen: [["rd-6ace2a35a26485e3a6467c07acaf32af81506663d6449f67f3b25c1fec85a3f7", "74719ee655cea688026b281e0ab64c7c67c2a7d1f546638b493b33f0dd16b1d3"]] });
  const input = { decisions: [], kosById: {}, sourcesByVorgang: {} };
  const fixtureHashes = new Map();
  for (const [index, member] of members.entries()) {
    const ko = { id: member.koId, vorgang_id: member.vorgangId,
      display_title: member.gkv ? "Synthetischer GKV-Interimsbericht " + index : "Synthetische Teilnahme " + index,
      display_summary: member.gkv
        ? "Interimsablehnung; mögliche milliardenschwere Folgen für rund 75 Millionen Versicherte laut Bericht."
        : index ? "Teilnahmebericht." : "Reise, Fotos und Vorfeldstatement.",
      source_document_count: member.quellen.length };
    input.kosById[member.koId] = ko;
    input.decisions.push({ knowledge_object_id: member.koId, vorgang_id: member.vorgangId,
      score: 0, decision: "Ignorieren" });
    input.sourcesByVorgang[member.vorgangId] = member.quellen.map(([id, pin]) => {
      const source = { id, title: "Synthetischer Quellenbeleg", url: "https://example.org/" + id,
        published_at: member.publishedAt || "2020-01-01T00:00:00Z" };
      fixtureHashes.set(hash(source), pin); return source;
    });
    fixtureHashes.set(hash(ko), member.koHash);
  }
  if (mitMeko) {
    const meko = gebundeneRegisterFixture();
    Object.assign(input.kosById, meko.input.kosById);
    Object.assign(input.sourcesByVorgang, meko.input.sourcesByVorgang);
    input.decisions.push(...meko.input.decisions.map(d => ({ ...d, score: 0, decision: "Ignorieren" })));
    for (const member of meko.members) {
      fixtureHashes.set(hash(input.kosById[member.koId]), member.koHash);
      fixtureHashes.set(hash(input.sourcesByVorgang[member.vorgangId][0]), member.quelleHash);
    }
  }
  const sandbox = { Map, module: { exports: {} }, require: name => {
    A.equal(name, "./briefing-speicher");
    return { hash: value => fixtureHashes.get(hash(value)) || hash(value) };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/helmut/briefing-ereignisgruppen"), "utf8"), sandbox);
  return { register: sandbox.module.exports, members, input };
}
test("Ankara verlangt die vollständigen exakten 3/1-Quellenmengen unabhängig von ihrer Reihenfolge", () => {
  const { register, members, input } = ankaraFixture();
  A.equal(register.planeAlle(input).length, 1);
  const reordered = structuredClone(input);
  reordered.sourcesByVorgang[members[0].vorgangId].reverse();
  A.equal(register.planeAlle(reordered).length, 1);
  for (const member of members) {
    for (const mode of ["fehlend", "zusätzlich", "doppelt", "quelleninhalt", "koinhalt", "entscheidung"]) {
      const bad = structuredClone(input), docs = bad.sourcesByVorgang[member.vorgangId];
      if (mode === "fehlend") docs.pop();
      if (mode === "zusätzlich") docs.push({ id: "nicht-geprüfte-quelle" });
      if (mode === "doppelt") docs.push(docs[0]);
      if (mode === "quelleninhalt") docs[0].title += " Drift";
      if (mode === "koinhalt") bad.kosById[member.koId].display_summary += " Drift";
      if (mode === "entscheidung") bad.decisions.push(bad.decisions.find(d => d.knowledge_object_id === member.koId));
      A.equal(register.planeAlle(bad).length, 0, member.koId + ":" + mode);
    }
  }
});
test("Unabhängige Gruppen bleiben unabhängig gültig und behalten alle Quellen und Mitgliedstexte", () => {
  const { register, members, input } = ankaraFixture(true);
  const plans = register.planeAlle(input);
  A.equal(plans.length, 2);
  const outputItems = input.decisions.map(d => ({ knowledgeObjectId: d.knowledge_object_id,
    vorgangId: d.vorgang_id, summary: input.kosById[d.knowledge_object_id].display_summary || "MEKO-Mitglied" }));
  const before = JSON.stringify({ input, outputItems });
  const out = register.gruppiereAusgaben({ items: outputItems, recommendations: input.decisions, plans });
  A.equal(out.items.length, 2); A.equal(out.recommendations.length, 2);
  const ankara = out.items.find(i => i.ereignisId.includes("ankara"));
  A.deepEqual(Array.from(ankara.ereignisMitglieder[0].quellenIds), members[0].quellen.map(s => s[0]));
  A.equal(ankara.ereignisMitglieder[0].summary, "Reise, Fotos und Vorfeldstatement.");
  A.equal(ankara.ereignisMitglieder[1].summary, "Teilnahmebericht.");
  A.equal(JSON.stringify({ input, outputItems }), before);
  const bad = structuredClone(input);
  bad.sourcesByVorgang[members[0].vorgangId][0].title += " Drift";
  A.equal(register.planeAlle(bad).length, 1);
  A.ok(register.planeAlle(bad)[0].id.includes("meko"));
  const outside = plans.map(p => register.ausserhalbTageskopf(p, { primaryVorgangId: members[0].vorgangId })).filter(Boolean);
  A.equal(outside.length, 1); A.ok(outside[0].id.includes("meko"));
});
test("Briefing-Caller verarbeitet alle unabhängigen Gruppen und der Aussagenvertrag erhält Ankara-Nebenmitglieder", () => {
  const { register, members, input } = ankaraFixture(true);
  const file = require.resolve("../lib/helmut/briefingContract");
  const actualRequire = require("node:module").createRequire(file);
  const sandbox = { Map, URL, process: { env: {} }, module: { exports: {} }, require: name =>
    name === "./briefing-ereignisgruppen" ? register : actualRequire(name) };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  const contract = sandbox.module.exports.toBriefingContractV3({ ...input,
    profile: { id: "fiktives-profil", full_name: "Fiktive Person", parliament: "bundestag" },
    now: "2026-10-10T08:00:00Z" });
  A.equal(contract.items.length, 2);
  A.equal(contract.personalizedRecommendations.length, 2);
  A.equal(new Set(contract.items.map(i => i.ereignisId)).size, 2);
  const claims = Aussagen.texte(contract, { kos: Object.values(input.kosById),
    quellen: Aussagen.quellenVertrag(input.sourcesByVorgang) });
  A.ok(claims.some(c => c.text === "Reise, Fotos und Vorfeldstatement."
    && c.vorgangId === members[0].vorgangId && c.pfad.includes("/ereignisMitglieder/")));
  A.ok(claims.some(c => c.text === "Teilnahmebericht."
    && c.vorgangId === members[1].vorgangId && c.pfad.includes("/ereignisMitglieder/")));
});
test("GKV bindet beide vollständigen Einzelquellen und lehnt jede KO-/Quellversion-Drift ab", () => {
  const { register, members, input } = ankaraFixture(false, true);
  const gkv = members.filter(m => m.gkv);
  const plans = value => register.planeAlle(value).filter(p => p.id.includes("gkv"));
  A.equal(plans(input).length, 1);
  for (const m of gkv) {
    for (const mode of ["fehlendeQuelle", "weitereQuelle", "fremdeQuelle", "quellversion", "kofeld", "entscheidung"]) {
      const bad = structuredClone(input), docs = bad.sourcesByVorgang[m.vorgangId];
      if (mode === "fehlendeQuelle") docs.pop();
      if (mode === "weitereQuelle") docs.push(docs[0]);
      if (mode === "fremdeQuelle") docs[0].id = "ungeprüfte-quelle";
      if (mode === "quellversion") docs[0].published_at = "2026-07-14T07:00:00Z";
      if (mode === "kofeld") bad.kosById[m.koId].display_summary += " Drift";
      if (mode === "entscheidung") bad.decisions = bad.decisions.filter(d => d.knowledge_object_id !== m.koId);
      A.equal(plans(bad).length, 0, m.koId + ":" + mode);
    }
  }
});
test("Drei unabhängige Gruppen bewahren GKV-Berichtsrisiko, Quellen und getrennte spätere Akte", () => {
  const { register, members, input } = ankaraFixture(true, true);
  const later = { id: "ko-spaeterer-bt-beschluss", vorgang_id: "vg-spaeterer-bt-beschluss",
    display_title: "Synthetischer späterer Bundestagsbeschluss", display_summary: "Der Bundestag hat danach beschlossen." };
  input.kosById[later.id] = later;
  input.sourcesByVorgang[later.vorgang_id] = [{ id: "quelle-bt", url: "https://example.org/bt" }];
  input.decisions.push({ knowledge_object_id: later.id, vorgang_id: later.vorgang_id, score: 0, decision: "Ignorieren" });
  const plans = register.planeAlle(input); A.equal(plans.length, 3);
  const file = require.resolve("../lib/helmut/briefingContract");
  const actualRequire = require("node:module").createRequire(file);
  const sandbox = { Map, URL, process: { env: {} }, module: { exports: {} }, require: name =>
    name === "./briefing-ereignisgruppen" ? register : actualRequire(name) };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  const contract = sandbox.module.exports.toBriefingContractV3({ ...input,
    profile: { id: "fiktives-profil", full_name: "Fiktive Person", parliament: "bundestag" },
    now: "2026-10-10T08:00:00Z" });
  A.equal(contract.items.length, 4); A.equal(contract.personalizedRecommendations.length, 4);
  const gkv = contract.items.find(i => i.ereignisId?.includes("gkv"));
  A.equal(gkv.ereignisMitglieder.length, 2);
  for (const m of members.filter(m => m.gkv)) {
    const row = gkv.ereignisMitglieder.find(i => i.knowledgeObjectId === m.koId);
    A.ok(row.summary.includes("mögliche milliardenschwere Folgen für rund 75 Millionen"));
    A.deepEqual(Array.from(row.quellenIds), m.quellen.map(q => q[0]));
  }
  const separate = contract.items.find(i => i.knowledgeObjectId === later.id);
  A.equal(separate.summary, later.display_summary); A.equal(separate.ereignisId, undefined);
  const claims = Aussagen.texte(contract, { kos: Object.values(input.kosById),
    quellen: Aussagen.quellenVertrag(input.sourcesByVorgang) });
  for (const m of members.filter(m => m.gkv)) A.ok(claims.some(c => c.vorgangId === m.vorgangId
    && c.text.includes("75 Millionen") && c.pfad.includes("/ereignisMitglieder/")));
  const withoutGkv = plans.map(p => register.ausserhalbTageskopf(p,
    { primaryVorgangId: members.find(m => m.gkv).vorgangId })).filter(Boolean);
  A.equal(withoutGkv.length, 2); A.ok(withoutGkv.every(p => !p.id.includes("gkv")));
});
console.log(`${passed}/${passed} Fallgruppen bestanden`);
