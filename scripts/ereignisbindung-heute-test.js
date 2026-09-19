"use strict";

// Synthetische Gegenstuecke zum belegten 500er Fehler: zwei Ministerreisen
// wurden allein durch "reist" + "heute" zu einem Vorgang verbunden.
// Private Originalaufnahme und Profile bleiben ausserhalb des Repositorys.
const assert = require("assert/strict");
const V = require("../lib/helmut/vorgang-identity");
const { resolveVorgang } = require("../lib/helmut/understanding");

const doc = (id, title, summary = "") => ({
  id, title, summary, published_at: "2026-09-15T08:00:00Z",
  source_name: "Beispielredaktion", url: `https://example.org/${id}`
});
const reisen = [
  doc("reise-a", "Bewerbung: Bergmann wirbt in Genf fuer Sitz im Menschenrechtsrat",
    "Vor dem Hintergrund der Bewerbung reist Aussenminister Bergmann heute in die Schweiz."),
  doc("reise-b", "Seidel bricht zu mehrtaegiger Reise nach Kanada auf",
    "Minister Seidel reist heute zu Gespraechen nach Kanada.")
];
const cluster = (documents) => ({ documents });
const bestand = (documents) => ({ documents, vorgangId: "vg-bestehend" });
const groups = (docs) => V.clusterRawDocuments(docs).map((c) => ({
  id: V.deriveVorgangId(c), documents: c.documents.map((d) => d.id)
}));
let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function main() {
  await test("Zwei verschiedene Reisen bleiben in beiden Richtungen getrennt", () => {
    for (const [a, b] of [reisen, [...reisen].reverse()]) {
      const result = V.docsShareEvent(a, b);
      assert.equal(result.gleich, false);
      assert.equal(result.grund, "zu-wenig-beweisgewicht");
      assert.deepEqual(result.overlap.treffer.slice().sort(), ["heute", "reist"]);
      assert.equal(result.overlap.gewichtSpezifisch, 1);
    }
  });
  await test("Beide Dokumente bilden verlustfrei zwei stabile Vorgangskennungen", () => {
    const before = structuredClone(reisen);
    const result = groups(reisen);
    assert.equal(result.length, 2);
    assert.equal(new Set(result.map((c) => c.id)).size, 2);
    assert.deepEqual(result.flatMap((c) => c.documents).sort(), ["reise-a", "reise-b"]);
    assert.deepEqual(groups([...reisen].reverse()), result);
    assert.deepEqual(reisen, before);
    assert.ok(result.every((c) => !c.id.startsWith("vg-heute-")));
  });
  await test("Keine nachtraegliche Bindung an die jeweils andere Reise", () => {
    for (const [a, b] of [reisen, [...reisen].reverse()]) {
      assert.equal(V.sameVorgang(cluster([a]), bestand([b])).gleich, false);
      assert.equal(V.sameVorgang(cluster([a]), bestand([b, { ...b, id: `${b.id}-folge` }])).gleich, false);
    }
  });
  await test("Der echte Resolver lehnt den fachfremden Bestandskandidaten ab", async () => {
    const result = await resolveVorgang(cluster([reisen[1]]), {
      findVorgangCandidates: async () => [{ id: "ko-alt", vorgang_id: "vg-bestehend" }],
      listVorgangDocuments: async (id) => {
        assert.equal(id, "ko-alt");
        return [reisen[0]];
      }
    });
    assert.equal(result.resolution, "neu");
    assert.equal(result.existing, null);
    assert.notEqual(result.vorgangId, "vg-bestehend");
    assert.equal(result.spuren.length, 1);
    assert.equal(result.spuren[0].gleich, false);
  });
  await test("Echte Folgemeldungen derselben Reise bleiben verbunden", () => {
    const folge = doc("reise-b-folge", "Seidel fuehrt Gespraeche in Kanada");
    assert.equal(V.docsShareEvent(reisen[1], folge).gleich, true);
    assert.equal(V.sameVorgang(cluster([folge]), bestand([reisen[1]])).gleich, true);
    assert.deepEqual(groups([...reisen, folge]).map((c) => c.documents.length).sort(), [1, 2]);
  });
  await test("Dieselbe Person und heute allein verbinden keine anderen Ereignisse", () => {
    const anders = doc("anderes-ereignis", "Seidel besucht heute einen Kindergarten");
    assert.equal(V.docsShareEvent(reisen[1], anders).gleich, false);
    assert.equal(V.docsShareEvent(anders, reisen[1]).gleich, false);
  });
  await test("Grossschreibung macht aus heute keinen Identitaetsbeleg", () => {
    const varianten = reisen.map((d) => ({ ...d, summary: d.summary.replace("heute", "HEUTE") }));
    assert.equal(groups(varianten).length, 2);
    assert.ok(varianten.every((d) => V.docAnchors(d).includes("heute")));
    assert.deepEqual(varianten.map((d) => V.docAnchors(d)), reisen.map((d) => V.docAnchors(d)));
  });
  await test("Zeitwort bleibt im unveraenderten Modellmaterial erhalten", () => {
    const before = structuredClone(reisen);
    const selected = V.selectPromptDocuments(reisen, 12);
    assert.deepEqual(selected.map((d) => d.id).sort(), ["reise-a", "reise-b"]);
    assert.ok(selected.every((d) => d.summary.includes("heute")));
    assert.deepEqual(reisen, before);
    const ohneZeitwort = { ...reisen[1], summary: reisen[1].summary.replace("heute ", "") };
    assert.equal(V.neueErkenntnisse([reisen[1]], [ohneZeitwort]).neu, false);
  });
  console.log(`\n${passed}/${passed} Gruppen erfolgreich`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
