"use strict";
const A = require("node:assert/strict");
const E = require("../lib/helmut/briefing-ereignisgruppen");
const Aussagen = require("../lib/helmut/briefing-aussagenbindung");
const fs = require("node:fs");
const vm = require("node:vm");
const { hash } = require("../lib/helmut/briefing-speicher");
let passed = 0;
function test(name, fn) {
  if (process.argv.includes("--additional-events-only") && !name.startsWith("VW/Litauen:")) return;
  if (process.argv.includes("--bka-event-only") && !name.startsWith("BKA:")) return;
  if (process.argv.includes("--contribution-event-only") && !name.startsWith("Beitragsentwurf:")) return;
  fn(); passed++; console.log("PASS " + name);
}
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
function additionalEpisodeFixture(mitBisherigenGruppen = false) {
  const members = [
    { episode: "vw", koId: "ko-vg-zurückrufen-20260925-960556",
      vorgangId: "vg-zurückrufen-20260925-960556",
      koHash: "8285d99ea9537af849e19bb7cdf326d4f3b562ececfafa9215e60850a937176f",
      quelleId: "rd-d000952bb20d481c5cb655370267548d8e34626e72cc3b3ad235328e1503b7b5",
      quelleHash: "75c013fd4b383a1464195eeecc0b12a6e2c37618eb2ea91f601cbbb0c040fd0c",
      summary: "Synthetisch: anfänglicher Lenkschrauben-Rückruf und Reparaturhinweis." },
    { episode: "vw", koId: "ko-vg-fehlerhafte-20260925-d06a89",
      vorgangId: "vg-fehlerhafte-20260925-d06a89",
      koHash: "cd5029558185bea460044ab3682770eb6b46367b4cddc03e1a27b00c1018aa4e",
      quelleId: "rd-61878316a37f03ad7542d0098f488128cf2f48ed6c794a8981830aa998e34dac",
      quelleHash: "bb2e6e1f88611f76889e4dfaa8744313e8f0238105f822563002e898d2febfca",
      summary: "Synthetisch: zusätzlicher Audi-/Seat-Umfang und Rückrufcodes." },
    { episode: "litauen", koId: "ko-vg-kampfflugzeuge-20260915-be221c",
      vorgangId: "vg-kampfflugzeuge-20260915-be221c",
      koHash: "c21bf8c33aed7b5177670a750d28a6e508d2cc45aba2b742a3e02ed8a8c008c6",
      quelleId: "rd-d49e4eeba6603280c83c3b9c1b3219309c963417cde1f1ad55beabdad49294b8",
      quelleHash: "20eac38cf6fc15fe16bf1cc55c402a05fce7aabd52bd2c6a6be15ed688110c3c",
      summary: "Synthetisch: Abschuss; späterer Sprengsatz- und Untersuchungsstand bleibt hier." },
    { episode: "litauen", koId: "ko-vg-abgeschossen-20260915-64651d",
      vorgangId: "vg-abgeschossen-20260915-64651d",
      koHash: "2db2cb7bc1b71e32c0f34ae228d3b1f7c0d2a4313923704013970669d7858557",
      quelleId: "rd-b05282187da9d8d22eb60896dc5e9f62fe5690a4971657afde8b858e2881ff29",
      quelleHash: "15294e8850dfb32100fa1f01bc119d8fa93ddcdd8aadd714a942878256c5ae5d",
      summary: "Synthetisch: erster Abschussbericht; Drohnentyp zunächst unklar." }
  ];
  const input = { decisions: [], kosById: {}, sourcesByVorgang: {} };
  const fixtureHashes = new Map();
  if (mitBisherigenGruppen) {
    const base = ankaraFixture(true, true);
    Object.assign(input.kosById, base.input.kosById);
    Object.assign(input.sourcesByVorgang, base.input.sourcesByVorgang);
    input.decisions.push(...base.input.decisions);
    for (const group of base.register.planeAlle(base.input)) {
      for (const member of group.mitglieder) {
        fixtureHashes.set(hash(input.kosById[member.koId]), member.koHash);
        for (const pin of member.quellen || [member]) {
          const source = input.sourcesByVorgang[member.vorgangId].find(s => s.id === pin.quelleId);
          fixtureHashes.set(hash(source), pin.quelleHash);
        }
      }
    }
  }
  for (const member of members) {
    const ko = { id: member.koId, vorgang_id: member.vorgangId,
      display_title: "Synthetischer " + member.episode + "-Bericht",
      display_summary: member.summary, source_document_count: 1 };
    const source = { id: member.quelleId, title: "Synthetischer eigener Bericht",
      url: "https://example.org/" + member.quelleId,
      published_at: member.episode === "litauen" ? "2026-09-15T05:12:20Z" : "2026-09-25T08:57:58Z" };
    input.kosById[member.koId] = ko;
    input.sourcesByVorgang[member.vorgangId] = [source];
    input.decisions.push({ knowledge_object_id: member.koId, vorgang_id: member.vorgangId,
      score: 0, decision: "Ignorieren" });
    fixtureHashes.set(hash(ko), member.koHash); fixtureHashes.set(hash(source), member.quelleHash);
  }
  const sandbox = { Map, module: { exports: {} }, require: name => {
    A.equal(name, "./briefing-speicher");
    return { hash: value => fixtureHashes.get(hash(value)) || hash(value) };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/helmut/briefing-ereignisgruppen"), "utf8"), sandbox);
  return { register: sandbox.module.exports, members, input };
}

test("VW/Litauen: beide Episoden verlangen vollständige exakte KO-/Quellen- und Entscheidungsbindungen", () => {
  const { register, members, input } = additionalEpisodeFixture();
  A.equal(register.planeAlle(input).length, 2);
  for (const member of members) {
    for (const mode of ["koDrift", "quelleDrift", "quelleFehlt", "quelleZusaetzlich",
      "quelleFremd", "entscheidungFehlt", "entscheidungDoppelt", "vorgangFremd"]) {
      const bad = structuredClone(input), docs = bad.sourcesByVorgang[member.vorgangId];
      if (mode === "koDrift") bad.kosById[member.koId].display_summary += " Drift";
      if (mode === "quelleDrift") docs[0].published_at += " Drift";
      if (mode === "quelleFehlt") docs.pop();
      if (mode === "quelleZusaetzlich") docs.push({ ...docs[0] });
      if (mode === "quelleFremd") docs[0].id = "quelle-nicht-geprueft";
      if (mode === "entscheidungFehlt") bad.decisions = bad.decisions.filter(d => d.knowledge_object_id !== member.koId);
      if (mode === "entscheidungDoppelt") bad.decisions.push(bad.decisions.find(d => d.knowledge_object_id === member.koId));
      if (mode === "vorgangFremd") bad.decisions.find(d => d.knowledge_object_id === member.koId).vorgang_id = "vg-fremd";
      const remaining = register.planeAlle(bad);
      A.equal(remaining.length, 1, member.koId + ":" + mode);
      A.ok(!remaining[0].id.includes(member.episode));
    }
  }
});

test("VW/Litauen: zusätzliche Modelle, Codes und späterer Untersuchungsstand behalten alle eigenen Aussagen", () => {
  const { register, members, input } = additionalEpisodeFixture();
  const originalItems = input.decisions.map(d => ({ knowledgeObjectId: d.knowledge_object_id,
    vorgangId: d.vorgang_id, title: input.kosById[d.knowledge_object_id].display_title,
    summary: input.kosById[d.knowledge_object_id].display_summary,
    sources: input.sourcesByVorgang[d.vorgang_id].map(s => ({ url: s.url })) }));
  const originalRecommendations = input.decisions.map(d => ({ ...d,
    recommended_action: "Eigenständiger Hinweis " + d.vorgang_id }));
  const before = JSON.stringify({ input, originalItems, originalRecommendations });
  const out = register.gruppiereAusgaben({ items: originalItems, recommendations: originalRecommendations,
    plans: register.planeAlle(input) });
  A.equal(out.items.length, 2); A.equal(out.recommendations.length, 2);
  const claims = Aussagen.texte({ items: out.items, personalizedRecommendations: out.recommendations }, {
    kos: Object.values(input.kosById), quellen: Aussagen.quellenVertrag(input.sourcesByVorgang) });
  for (const member of members) {
    const card = out.items.find(i => i.ereignisId.includes(member.episode));
    const retained = card.ereignisMitglieder.find(i => i.knowledgeObjectId === member.koId);
    A.deepEqual(Array.from(retained.quellenIds), [member.quelleId]);
    const { quellenIds, ...original } = retained;
    A.deepEqual(original, originalItems.find(i => i.knowledgeObjectId === member.koId));
    A.ok(claims.some(c => c.text === member.summary && c.vorgangId === member.vorgangId
      && c.pfad.includes("/ereignisMitglieder/")));
    A.ok(claims.some(c => c.text === "Eigenständiger Hinweis " + member.vorgangId
      && c.vorgangId === member.vorgangId && c.pfad.includes("/ereignisMitglieder/")));
  }
  A.equal(JSON.stringify({ input, originalItems, originalRecommendations }), before);
});

test("VW/Litauen: Caller bewahrt fünf unabhängige Gruppen und lässt unbekannte BKA-Versionen einzeln", () => {
  const { register, input } = additionalEpisodeFixture(true);
  const bkaIds = ["ko-vg-bundeskriminalamtes-20260915-12d9ca", "ko-vg-rekordschaden-20260915-c60639"];
  for (const id of bkaIds) {
    const vorgang = id.slice(3);
    input.kosById[id] = { id, vorgang_id: vorgang, display_title: "Synthetischer BKA-Bericht",
      display_summary: "Eigenständige Aussage; gemeinsame Jahresversion ungeklärt." };
    input.sourcesByVorgang[vorgang] = [{ id: "synthetische-quelle-" + id, url: "https://example.org/" + id }];
    input.decisions.push({ knowledge_object_id: id, vorgang_id: vorgang, score: 0, decision: "Ignorieren" });
  }
  A.equal(register.planeAlle(input).length, 5);
  const file = require.resolve("../lib/helmut/briefingContract");
  const actualRequire = require("node:module").createRequire(file);
  const sandbox = { Map, URL, process: { env: {} }, module: { exports: {} }, require: name =>
    name === "./briefing-ereignisgruppen" ? register : actualRequire(name) };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  const contract = sandbox.module.exports.toBriefingContractV3({ ...input,
    profile: { id: "fiktives-profil", full_name: "Fiktive Person", parliament: "bundestag" },
    now: "2026-10-10T08:00:00Z" });
  A.equal(contract.items.length, 7); A.equal(contract.personalizedRecommendations.length, 7);
  A.equal(new Set(contract.items.filter(i => i.ereignisId).map(i => i.ereignisId)).size, 5);
  for (const id of bkaIds) {
    const separate = contract.items.find(i => i.knowledgeObjectId === id);
    A.ok(separate); A.equal(separate.ereignisId, undefined);
    A.equal(separate.summary, input.kosById[id].display_summary);
  }
});

test("VW/Litauen: Tageskopf schützt jede neue Episode einzeln und unbekannte Vorgänge bleiben ungruppiert", () => {
  const { register, members, input } = additionalEpisodeFixture();
  const plans = register.planeAlle(input);
  for (const member of members) {
    for (const state of [{ primaryVorgangId: member.vorgangId }, { relatedVorgangIds: [member.vorgangId] }]) {
      const remaining = plans.map(p => register.ausserhalbTageskopf(p, state)).filter(Boolean);
      A.equal(remaining.length, 1); A.ok(!remaining[0].id.includes(member.episode));
    }
  }
  const unknown = structuredClone(input);
  for (const member of members) {
    unknown.kosById[member.koId].id += "-anderer-vorgang";
    unknown.decisions.find(d => d.knowledge_object_id === member.koId).knowledge_object_id += "-anderer-vorgang";
  }
  A.equal(register.planeAlle(unknown).length, 0);
});
function bkaEpisodeFixture(mitBisherigenGruppen = false) {
  const input = { decisions: [], kosById: {}, sourcesByVorgang: {} };
  const fixtureHashes = new Map();
  if (mitBisherigenGruppen) {
    const base = additionalEpisodeFixture(true);
    Object.assign(input.kosById, base.input.kosById);
    Object.assign(input.sourcesByVorgang, base.input.sourcesByVorgang);
    input.decisions.push(...base.input.decisions);
    for (const group of base.register.planeAlle(base.input)) {
      for (const member of group.mitglieder) {
        fixtureHashes.set(hash(input.kosById[member.koId]), member.koHash);
        for (const pin of member.quellen || [member]) {
          const source = input.sourcesByVorgang[member.vorgangId].find(s => s.id === pin.quelleId);
          fixtureHashes.set(hash(source), pin.quelleHash);
        }
      }
    }
  }
  const members = [
    { koId: "ko-vg-bundeskriminalamtes-20260915-12d9ca", vorgangId: "vg-bundeskriminalamtes-20260915-12d9ca",
      koHash: "a8359f052a406779c13b78f893683d68bfb26d9b96388a65ced2ea02efe0ee41",
      quelleId: "rd-2c9cd5d87b8aba92964d5cd3a003be0595d4537b51a2fc46fef346ebf566fcbd",
      quelleHash: "2ea768e7fb98a8ff0f1da31044c6dd78a954ae561fe2cb29c1f5e0381ea438fd",
      summary: "Synthetisch: Lagebild 2025; Verfahren und veränderte Erscheinungsformen." },
    { koId: "ko-vg-rekordschaden-20260915-c60639", vorgangId: "vg-rekordschaden-20260915-c60639",
      koHash: "0df2038ae75a51e11d89ba05de766136855c42e40c65d5e9933d8df3127b12f0",
      quelleId: "rd-1bbfb7b186f044cee845bca759fc280100d1587ffba0e6d11e1671aff6bfa7f2",
      quelleHash: "8a45ef88a9ed457c57f37a67d541adc1b5a0faf6c948c2245b2fbc942729b227",
      summary: "Synthetisch: jährliche Schäden und eigener Täterstrukturbericht." }
  ];
  for (const member of members) {
    const ko = { id: member.koId, vorgang_id: member.vorgangId,
      display_title: "Synthetischer eigener BKA-Bericht", display_summary: member.summary };
    const source = { id: member.quelleId, title: "Synthetische eigene BKA-Quelle",
      url: "https://example.org/" + member.quelleId, published_at: "2026-09-15T08:00:38Z" };
    input.kosById[member.koId] = ko; input.sourcesByVorgang[member.vorgangId] = [source];
    input.decisions.push({ knowledge_object_id: member.koId, vorgang_id: member.vorgangId,
      score: 0, decision: "Ignorieren" });
    fixtureHashes.set(hash(ko), member.koHash); fixtureHashes.set(hash(source), member.quelleHash);
  }
  const sandbox = { Map, module: { exports: {} }, require: name => {
    A.equal(name, "./briefing-speicher");
    return { hash: value => fixtureHashes.get(hash(value)) || hash(value) };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/helmut/briefing-ereignisgruppen"), "utf8"), sandbox);
  return { register: sandbox.module.exports, members, input };
}

test("BKA: konkrete Jahresepisode verlangt beide vollständigen exakten KO-/Quellversionen", () => {
  const { register, members, input } = bkaEpisodeFixture();
  A.equal(register.planeAlle(input).length, 1);
  for (const member of members) {
    for (const mode of ["koDrift", "quelleDrift", "quelleFehlt", "quelleZusaetzlich",
      "quelleFremd", "entscheidungFehlt", "entscheidungDoppelt", "vorgangFremd"]) {
      const bad = structuredClone(input), docs = bad.sourcesByVorgang[member.vorgangId];
      if (mode === "koDrift") bad.kosById[member.koId].display_summary += " andere Jahresversion";
      if (mode === "quelleDrift") docs[0].published_at = "2027-09-15T08:00:38Z";
      if (mode === "quelleFehlt") docs.pop();
      if (mode === "quelleZusaetzlich") docs.push({ ...docs[0] });
      if (mode === "quelleFremd") docs[0].id = "quelle-andere-jahresversion";
      if (mode === "entscheidungFehlt") bad.decisions = bad.decisions.filter(d => d.knowledge_object_id !== member.koId);
      if (mode === "entscheidungDoppelt") bad.decisions.push(bad.decisions.find(d => d.knowledge_object_id === member.koId));
      if (mode === "vorgangFremd") bad.decisions.find(d => d.knowledge_object_id === member.koId).vorgang_id = "vg-anderes-jahr";
      A.equal(register.planeAlle(bad).length, 0, member.koId + ":" + mode);
    }
  }
});

test("BKA: sechs unabhängige Gruppen erhalten beide eigenen Volltexte und ihre getrennten Quellen", () => {
  const { register, members, input } = bkaEpisodeFixture(true);
  const plans = register.planeAlle(input); A.equal(plans.length, 6);
  const file = require.resolve("../lib/helmut/briefingContract");
  const actualRequire = require("node:module").createRequire(file);
  const sandbox = { Map, URL, process: { env: {} }, module: { exports: {} }, require: name =>
    name === "./briefing-ereignisgruppen" ? register : actualRequire(name) };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  const contract = sandbox.module.exports.toBriefingContractV3({ ...input,
    profile: { id: "fiktives-profil", full_name: "Fiktive Person", parliament: "bundestag" },
    now: "2026-10-10T08:00:00Z" });
  A.equal(contract.items.length, 6); A.equal(contract.personalizedRecommendations.length, 6);
  A.equal(new Set(contract.items.map(i => i.ereignisId)).size, 6);
  const bka = contract.items.find(i => i.ereignisId.includes("bka-jahreslagebild"));
  const claims = Aussagen.texte(contract, { kos: Object.values(input.kosById),
    quellen: Aussagen.quellenVertrag(input.sourcesByVorgang) });
  for (const member of members) {
    const row = bka.ereignisMitglieder.find(i => i.knowledgeObjectId === member.koId);
    A.equal(row.summary, member.summary);
    A.deepEqual(Array.from(row.quellenIds), [member.quelleId]);
    A.ok(claims.some(c => c.text === member.summary && c.vorgangId === member.vorgangId
      && c.pfad.includes("/ereignisMitglieder/")));
    const remaining = plans.map(p => register.ausserhalbTageskopf(p, { primaryVorgangId: member.vorgangId })).filter(Boolean);
    A.equal(remaining.length, 5); A.ok(remaining.every(p => !p.id.includes("bka-jahreslagebild")));
  }
});
function contributionEpisodeFixture(mitBisherigenGruppen = false) {
  const input = { decisions: [], kosById: {}, sourcesByVorgang: {} };
  const fixtureHashes = new Map();
  if (mitBisherigenGruppen) {
    const base = bkaEpisodeFixture(true);
    Object.assign(input.kosById, base.input.kosById);
    Object.assign(input.sourcesByVorgang, base.input.sourcesByVorgang);
    input.decisions.push(...base.input.decisions);
    for (const group of base.register.planeAlle(base.input)) {
      for (const member of group.mitglieder) {
        fixtureHashes.set(hash(input.kosById[member.koId]), member.koHash);
        for (const pin of member.quellen || [member]) {
          const source = input.sourcesByVorgang[member.vorgangId].find(s => s.id === pin.quelleId);
          fixtureHashes.set(hash(source), pin.quelleHash);
        }
      }
    }
  }
  const members = [
    { koId: "ko-vg-erhöhung-20260922-de6d0d", vorgangId: "vg-erhöhung-20260922-de6d0d",
      koHash: "ba43b33bdca570f292f3ddd2cfa1178774d7808e4630392e04bd7e9d9f8fad85",
      quelleId: "rd-8ad6b4f43af443505c9e772f78881c07bd78b00c074fd6dc79988794e8e2a5c7",
      quelleHash: "3f904b134a9afad7b235e46be9806a3fa4bafdf9475f5f2305f8f6964f4596d1",
      summary: "Synthetisch: geplanter jährlicher Entwurf 2027 und eigener Einkommenshinweis." },
    { koId: "ko-vg-rentenversicherung-20260921-eb1ea2", vorgangId: "vg-rentenversicherung-20260921-eb1ea2",
      koHash: "33262ba088990d969192de9c51e7b886959452cfaa7f659546bfbb04b8fed338",
      quelleId: "rd-1d6fcd3384dfffdca863f341b54cc237779077f185a246c079641b3d7dfb06cd",
      quelleHash: "8086ecdeacb261dc3c5db0d35a56fe1cdd1e831b7858a4aa8f6f3b465845b85f",
      summary: "Synthetisch: kommendes Jahr; Kabinett und Bundesrat müssen noch beschließen." }
  ];
  for (const member of members) {
    const ko = { id: member.koId, vorgang_id: member.vorgangId,
      display_title: "Synthetischer Beitragsentwurf", display_summary: member.summary };
    const source = { id: member.quelleId, title: "Synthetischer eigener Entwurfsbericht",
      url: "https://example.org/" + member.quelleId, published_at: "2026-09-21T15:03:53Z" };
    input.kosById[member.koId] = ko; input.sourcesByVorgang[member.vorgangId] = [source];
    input.decisions.push({ knowledge_object_id: member.koId, vorgang_id: member.vorgangId,
      score: 0, decision: "Ignorieren" });
    fixtureHashes.set(hash(ko), member.koHash); fixtureHashes.set(hash(source), member.quelleHash);
  }
  const sandbox = { Map, module: { exports: {} }, require: name => {
    A.equal(name, "./briefing-speicher");
    return { hash: value => fixtureHashes.get(hash(value)) || hash(value) };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/helmut/briefing-ereignisgruppen"), "utf8"), sandbox);
  return { register: sandbox.module.exports, members, input };
}

test("Beitragsentwurf: exakte vollständige KO-/Quellversionen grenzen das aktuelle Jahrespaar ein", () => {
  const { register, members, input } = contributionEpisodeFixture();
  A.equal(register.planeAlle(input).length, 1);
  for (const member of members) {
    for (const mode of ["koDrift", "quelleDrift", "quelleFehlt", "quelleZusaetzlich",
      "quelleFremd", "entscheidungFehlt", "entscheidungDoppelt", "vorgangFremd"]) {
      const bad = structuredClone(input), docs = bad.sourcesByVorgang[member.vorgangId];
      if (mode === "koDrift") bad.kosById[member.koId].display_summary += " anderer Entwurf";
      if (mode === "quelleDrift") docs[0].published_at = "2027-09-21T15:03:53Z";
      if (mode === "quelleFehlt") docs.pop();
      if (mode === "quelleZusaetzlich") docs.push({ ...docs[0] });
      if (mode === "quelleFremd") docs[0].id = "quelle-anderer-entwurf";
      if (mode === "entscheidungFehlt") bad.decisions = bad.decisions.filter(d => d.knowledge_object_id !== member.koId);
      if (mode === "entscheidungDoppelt") bad.decisions.push(bad.decisions.find(d => d.knowledge_object_id === member.koId));
      if (mode === "vorgangFremd") bad.decisions.find(d => d.knowledge_object_id === member.koId).vorgang_id = "vg-anderes-jahr";
      A.equal(register.planeAlle(bad).length, 0, member.koId + ":" + mode);
    }
  }
});

test("Beitragsentwurf: sieben Gruppen bewahren Entwurfsstatus, eigene Quellen und einen späteren Akt", () => {
  const { register, members, input } = contributionEpisodeFixture(true);
  const later = { id: "ko-synthetisch-spaeterer-beitragsbeschluss", vorgang_id: "vg-spaeterer-beitragsbeschluss",
    display_title: "Synthetischer späterer Beschluss", display_summary: "Späterer selbstständiger Akt." };
  input.kosById[later.id] = later;
  input.sourcesByVorgang[later.vorgang_id] = [{ id: "quelle-spaeterer-beschluss", url: "https://example.org/spaeter" }];
  input.decisions.push({ knowledge_object_id: later.id, vorgang_id: later.vorgang_id, score: 0, decision: "Ignorieren" });
  const plans = register.planeAlle(input); A.equal(plans.length, 7);
  const file = require.resolve("../lib/helmut/briefingContract");
  const actualRequire = require("node:module").createRequire(file);
  const sandbox = { Map, URL, process: { env: {} }, module: { exports: {} }, require: name =>
    name === "./briefing-ereignisgruppen" ? register : actualRequire(name) };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  const contract = sandbox.module.exports.toBriefingContractV3({ ...input,
    profile: { id: "fiktives-profil", full_name: "Fiktive Person", parliament: "bundestag" },
    now: "2026-10-10T08:00:00Z" });
  A.equal(contract.items.length, 8); A.equal(contract.personalizedRecommendations.length, 8);
  A.equal(new Set(contract.items.filter(i => i.ereignisId).map(i => i.ereignisId)).size, 7);
  const group = contract.items.find(i => i.ereignisId?.includes("jahresentwurf"));
  const claims = Aussagen.texte(contract, { kos: Object.values(input.kosById),
    quellen: Aussagen.quellenVertrag(input.sourcesByVorgang) });
  for (const member of members) {
    const row = group.ereignisMitglieder.find(i => i.knowledgeObjectId === member.koId);
    A.equal(row.summary, member.summary); A.deepEqual(Array.from(row.quellenIds), [member.quelleId]);
    A.ok(claims.some(c => c.text === member.summary && c.vorgangId === member.vorgangId
      && c.pfad.includes("/ereignisMitglieder/")));
    const remaining = plans.map(p => register.ausserhalbTageskopf(p, { primaryVorgangId: member.vorgangId })).filter(Boolean);
    A.equal(remaining.length, 6); A.ok(remaining.every(p => !p.id.includes("jahresentwurf")));
  }
  const separate = contract.items.find(i => i.knowledgeObjectId === later.id);
  A.equal(separate.summary, later.display_summary); A.equal(separate.ereignisId, undefined);
});
console.log(`${passed}/${passed} Fallgruppen bestanden`);
