"use strict";
const assert = require("node:assert/strict");
const L = require("../lib/helmut/lage");
const M = require("../lib/helmut/matching");
const f = require("./fixtures/lage-auswahl-beleg.json");
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.log("FAIL " + name + ": " + e.message); } }
const ko = (id, headline) => ({ id, vorgang_id: "vg-" + id, status: "neu",
  understanding_status: "complete", headline, was_ist_passiert: headline });
const storage = (kos, matches) => ({ listKnowledgeObjects: async () => kos,
  listMatchingResults: async () => matches });
async function select(kos, profile, ranked = kos.slice(0, 12)) {
  return L.loadRankedVorgaenge(storage(kos, ranked.map(k => ({ knowledge_object_id: k.id }))),
    M.matchProfileToKnowledgeObjects, profile, profile.id || "mandat-test");
}
(async () => {
  await test("Echter Digitalvorgang erreicht die Quelleingabe trotz Rang14 im Merkmalsvektor", async () => {
    const before = JSON.stringify(f);
    const scored = M.matchProfileToKnowledgeObjects(f.profile, f.kos, { limit: 14 });
    assert.equal(scored.find(r => r.knowledge_object_id === f.gesuchterKandidat).rank, 14);
    assert.equal(scored[0].knowledge_object_id, "ko-vg-altersvorsorgedepot-20260908-0c8129");
    const rows = await L.loadRankedVorgaenge(storage(f.kos, f.matches), M.matchProfileToKnowledgeObjects,
      f.profile, f.profile.id);
    assert.equal(rows.length, 12); assert.equal(new Set(rows.map(r => r.id)).size, 12);
    assert(rows.some(r => r.id === f.gesuchterKandidat), "Digitalvorgang darf nicht hinter unbelegter Hash-Aehnlichkeit verschwinden");
    assert.equal(JSON.stringify(f), before, "Originalprofil, KOs und gespeicherte Ränge bleiben unveraendert");
  });
  await test("Ohne ausdruecklichen Textbezug bleibt die gespeicherte Auswahl erhalten", async () => {
    const kos = Array.from({ length: 13 }, (_, i) => ko("alt-" + i, "Ein benannter Vorgang"));
    const old = kos.slice(0, 12), rows = await select(kos, {}, old);
    assert.deepEqual(rows.map(k => k.id), old.map(k => k.id));
  });
  await test("Region und eigener Schwerpunkt geben neue Kandidaten ohne erfundene Mitgliedschaft weiter", async () => {
    const old = Array.from({ length: 12 }, (_, i) => ko("alt-" + i, "Unternehmen veroeffentlicht Bilanz"));
    for (const [profile, current] of [[{ state: "Thueringen" }, ko("regional", "Thueringer Landtag beraet einen Antrag")],
      [{ focusTopics: ["Pflegeversicherung"] }, ko("thema", "Neue Regeln zur Pflegeversicherung vorgelegt")]]) {
      const rows = await select([...old, current], profile, old);
      assert.equal(rows[0].id, current.id); assert.equal(rows.length, 12);
      assert.equal(rows[0].relevanz_erklaerung, undefined, "Wortbezug ist kein Ausschussmitgliedschaftsbeleg");
    }
  });
  await test("Aehnliche Teilwoerter und generische Entwicklung sind kein passender Fachbezug", async () => {
    const old = Array.from({ length: 12 }, (_, i) => ko("alt-" + i, "Quelle berichtet einen Vorgang"));
    for (const [committee, title] of [["Menschenrechte und humanitaere Hilfe", "Neue Rechte im Vertragsrecht"],
      ["Ausschuss fuer wirtschaftliche Zusammenarbeit und Entwicklung", "Wirtschaftliche Entwicklung im Aktienhandel"]]) {
      const rows = await select([...old, ko("fremd", title)], { committees: [committee] }, old);
      assert.deepEqual(rows.map(k => k.id), old.map(k => k.id));
    }
  });
  await test("Unverstandene und leere Kandidaten gelangen trotz Wortbezug nicht in die Auswahl", async () => {
    const old = Array.from({ length: 12 }, (_, i) => ko("alt-" + i, "Quelle berichtet einen Vorgang"));
    const pending = { ...ko("pending", "Digitale Staatsmodernisierung"), understanding_status: "pending" };
    const empty = { ...ko("empty", "Digitale Staatsmodernisierung"), was_ist_passiert: "" };
    const rows = await select([...old, pending, empty], { committees: ["Digitales"] }, old);
    assert.deepEqual(rows.map(k => k.id), old.map(k => k.id));
  });
  console.log(`${passed}/${passed + failed} Testgruppen bestanden.`);
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
