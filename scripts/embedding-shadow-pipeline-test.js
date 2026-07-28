"use strict";

// Sprint 22B — Tests der Offline-Shadow-Pipeline (0 Netz, 0 DB, 0 KI).
// Deckt die 20 Pflichtprüfungen des Sprintauftrags und die AB14-Fehlerszenarien
// mit einem Mock-Provider ab. Läuft im kanonischen Offline-Runner.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  schaetzeTokens, createFileStore, createMemoryStore, planeLauf,
  bildeBatches, kostenSchaetzung, runShadowPipeline
} = require("../lib/helmut/embedding-shadow-pipeline.js");
const {
  RECIPE_VERSION, buildCanonicalEmbeddingInput, computeEmbeddingInputHash
} = require("../lib/helmut/embedding-contract.js");
const matching = require("../lib/helmut/matching.js");

let bestanden = 0, fehlgeschlagen = 0;
function pruefe(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log("PASS ", name); bestanden += 1; })
    .catch((e) => { console.log("FAIL ", name, "→", e.message); fehlgeschlagen += 1; });
}

function ko(id, extra = {}) {
  return {
    id,
    understanding_status: "complete",
    headline: `Testvorgang ${id} mit ausreichend langem Titel`,
    was_ist_passiert: `Im Vorgang ${id} ist eine politisch relevante Entscheidung mit ausreichend langem Kerntext getroffen worden.`,
    warum_wichtig: "Der Vorgang hat Auswirkungen auf laufende Beratungen.",
    event_type: "bericht",
    decision_entities: [{ name: "Bundesministerium für Arbeit und Soziales" }],
    related_entities: [{ name: "SPD" }],
    ...extra
  };
}

// Deterministischer Mock-Provider: liefert je Eingang einen gültigen Vektor.
function mockProvider(dim, mutator) {
  const aufrufe = [];
  const fn = async ({ inputs }) => {
    aufrufe.push(inputs);
    const vectors = inputs.map((text, i) => {
      const v = new Array(dim).fill(0).map((_, j) => Math.sin(j + text.length) + 0.001 * i + 0.01);
      return v;
    });
    return mutator ? mutator({ vectors, inputs, aufruf: aufrufe.length }) : { vectors };
  };
  fn.aufrufe = aufrufe;
  return fn;
}

const CFG = { model: "test-embed-1", providerName: "mock", dim: 8, jetzt: () => "2026-07-28T15:00:00Z" };

async function main() {
  const feste = [ko("ko-a"), ko("ko-b"), ko("ko-c"), ko("ko-d"), ko("ko-e")];

  // 1+2: kanonischer Eingang und Hash stabil (Pipeline-Sicht)
  await pruefe("01 kanonischer Eingang ist über die Pipeline stabil", () => {
    const s = createMemoryStore();
    const p1 = planeLauf(feste, s, CFG);
    const p2 = planeLauf(feste, s, CFG);
    assert.deepStrictEqual(p1.berechnen.map(a => [a.id, a.inputHash]), p2.berechnen.map(a => [a.id, a.inputHash]));
    assert.strictEqual(p1.berechnen[0].text, buildCanonicalEmbeddingInput(feste[0]).text);
  });
  await pruefe("02 Hash-Werte sind deterministisch und rezeptgebunden", () => {
    const h1 = computeEmbeddingInputHash(feste[0]);
    const h2 = computeEmbeddingInputHash({ ...feste[0] });
    assert.strictEqual(h1, h2);
    const p = planeLauf([feste[0]], createMemoryStore(), CFG);
    assert.strictEqual(p.berechnen[0].inputHash, h1);
  });

  // 3+4: Berechtigung und Ausschluss
  await pruefe("03 Berechtigungsregeln greifen in der Pipeline", () => {
    const p = planeLauf([ko("ko-ok"), { id: "ko-roh", understanding_status: "pending" }], createMemoryStore(), CFG);
    assert.deepStrictEqual(p.berechnen.map(a => a.id), ["ko-ok"]);
    assert.deepStrictEqual(p.ausgeschlossen, [{ id: "ko-roh", grund: "nicht-verstanden" }]);
  });
  await pruefe("04 ausgeschlossene Objekte (aussortiert/zusammengeführt/Mindestinhalt)", () => {
    const p = planeLauf([
      ko("ko-aus", { status: "aussortiert:run1:pending" }),
      ko("ko-merge", { merged_into: "ko-x" }),
      ko("ko-kurz", { headline: "kurz", was_ist_passiert: "", warum_wichtig: "" })
    ], createMemoryStore(), CFG);
    assert.strictEqual(p.berechnen.length, 0);
    assert.deepStrictEqual(p.ausgeschlossen.map(a => a.grund).sort(), ["aussortiert", "mindestinhalt-fehlt", "zusammengefuehrt"]);
  });

  // 5: Batch-Bildung
  await pruefe("05 Batch-Bildung respektiert die Batchgröße", () => {
    const auftraege = feste.map(k => ({ id: k.id, text: "x".repeat(40), tokens: 10, inputHash: "h" }));
    const { batches, tokensGesamt } = bildeBatches(auftraege, { batchGroesse: 2 });
    assert.deepStrictEqual(batches.map(b => b.length), [2, 2, 1]);
    assert.strictEqual(tokensGesamt, 50);
  });

  // 6: Objektlimit
  await pruefe("06 hartes Objektlimit wird eingehalten", async () => {
    const s = createMemoryStore();
    const b = await runShadowPipeline(feste, s, mockProvider(8), { ...CFG, maxObjekte: 2 });
    assert.strictEqual(b.berechnet, 2);
    assert.strictEqual(b.objektlimitAbgeschnitten, 3);
    assert.strictEqual(Object.keys(s.eintraege).length, 2);
  });

  // 7: Tokenlimit (fail-closed)
  await pruefe("07 hartes Tokenlimit ist fail-closed", async () => {
    const s = createMemoryStore();
    const tokensEins = schaetzeTokens(buildCanonicalEmbeddingInput(feste[0]).text);
    const b = await runShadowPipeline(feste, s, mockProvider(8), { ...CFG, maxTokens: tokensEins * 2 });
    assert.ok(b.berechnet <= 2, `berechnet=${b.berechnet}`);
    assert.ok(b.tokenlimitAbgeschnitten >= 3);
    assert.ok(b.tokens <= tokensEins * 2);
  });

  // 8: Dry-Run
  await pruefe("08 Dry-Run ruft keinen Provider und ändert keine Ablage", async () => {
    const s = createMemoryStore();
    const provider = mockProvider(8);
    const b = await runShadowPipeline(feste, s, provider, { ...CFG, dryRun: true, preisProMTok: 0.02 });
    assert.strictEqual(b.dryRun, true);
    assert.strictEqual(b.geplant, 5);
    assert.strictEqual(provider.aufrufe.length, 0);
    assert.deepStrictEqual(s.eintraege, {});
    assert.ok(b.kostenSchaetzung > 0);
  });
  await pruefe("08b ohne Provider ist nur der Dry-Run erlaubt", async () => {
    await assert.rejects(() => runShadowPipeline(feste, createMemoryStore(), null, CFG), /Dry-Run/);
    const b = await runShadowPipeline(feste, createMemoryStore(), null, { ...CFG, dryRun: true });
    assert.strictEqual(b.geplant, 5);
  });

  // 9: Wiederaufnahme nach Abbruch
  await pruefe("09 Wiederaufnahme: zweiter Lauf plant exakt den Rest", async () => {
    const s = createMemoryStore();
    await runShadowPipeline(feste, s, mockProvider(8), { ...CFG, maxObjekte: 2 }); // "Abbruch" nach 2
    const b2 = await runShadowPipeline(feste, s, mockProvider(8), { ...CFG });
    assert.strictEqual(b2.aktuellUebersprungen, 2);
    assert.strictEqual(b2.berechnet, 3);
    assert.strictEqual(Object.keys(s.eintraege).length, 5);
  });

  // 10: Idempotenz
  await pruefe("10 Idempotenz: identischer Zweitlauf berechnet nichts", async () => {
    const s = createMemoryStore();
    await runShadowPipeline(feste, s, mockProvider(8), CFG);
    const provider2 = mockProvider(8);
    const b2 = await runShadowPipeline(feste, s, provider2, CFG);
    assert.strictEqual(b2.berechnet, 0);
    assert.strictEqual(b2.aktuellUebersprungen, 5);
    assert.strictEqual(provider2.aufrufe.length, 0);
  });

  // 11: Dimensionsprüfung
  await pruefe("11 falsche Dimension wird abgelehnt, kein Vektor gespeichert", async () => {
    const s = createMemoryStore();
    const provider = mockProvider(8, (r) => ({ vectors: r.vectors.map(v => v.slice(0, 4)) }));
    const b = await runShadowPipeline([feste[0]], s, provider, CFG);
    assert.strictEqual(b.berechnet, 0);
    assert.strictEqual(b.fehlgeschlagen[0].grund, "antwort: falsche-dimension");
    assert.strictEqual(s.eintraege["ko-a"].status, "fehlgeschlagen");
    assert.strictEqual(s.eintraege["ko-a"].vector, null);
  });

  // 12: ungültige Werte
  await pruefe("12 NaN/ungültige Werte werden abgelehnt", async () => {
    const s = createMemoryStore();
    const provider = mockProvider(8, (r) => { r.vectors[0][3] = NaN; return { vectors: r.vectors }; });
    const b = await runShadowPipeline([feste[0]], s, provider, CFG);
    assert.strictEqual(b.berechnet, 0);
    assert.strictEqual(s.eintraege["ko-a"].last_error, "antwort: ungueltige-werte");
  });
  await pruefe("12b leerer Vektor und Nullvektor werden abgelehnt", async () => {
    const s = createMemoryStore();
    const provider = mockProvider(8, (r) => ({ vectors: [[], new Array(8).fill(0)] }));
    const b = await runShadowPipeline([feste[0], feste[1]], s, provider, CFG);
    assert.strictEqual(b.berechnet, 0);
    const gruende = b.fehlgeschlagen.map(f => f.grund).sort();
    assert.deepStrictEqual(gruende, ["antwort: leer", "antwort: nullvektor"]);
  });

  // 13: Modellwechsel
  await pruefe("13 Modellwechsel erzwingt Neuberechnung", async () => {
    const s = createMemoryStore();
    await runShadowPipeline(feste, s, mockProvider(8), CFG);
    const b2 = await runShadowPipeline(feste, s, mockProvider(8), { ...CFG, model: "test-embed-2" });
    assert.strictEqual(b2.berechnet, 5);
    assert.strictEqual(s.eintraege["ko-a"].model, "test-embed-2");
  });

  // 14: Rezeptwechsel
  await pruefe("14 Rezeptwechsel erzwingt Neuberechnung", async () => {
    const s = createMemoryStore();
    await runShadowPipeline(feste, s, mockProvider(8), CFG);
    const b2 = await runShadowPipeline(feste, s, mockProvider(8), { ...CFG, recipeVersion: "ko-kanon-2" });
    assert.strictEqual(b2.berechnet, 5);
    assert.strictEqual(s.eintraege["ko-a"].recipe_version, "ko-kanon-2");
  });

  // 15: gemischte Versionen
  await pruefe("15 gemischte Modellversionen: nur der Altbestand wird nachgezogen", async () => {
    const s = createMemoryStore();
    await runShadowPipeline([feste[0], feste[1]], s, mockProvider(8), { ...CFG, model: "alt-modell" });
    await runShadowPipeline(feste, s, mockProvider(8), { ...CFG, maxObjekte: 0 }); // kein Write
    const b = await runShadowPipeline(feste, s, mockProvider(8), CFG);
    assert.strictEqual(b.berechnet, 5); // 2 Modellwechsel + 3 neu
    const modelle = new Set(Object.values(s.eintraege).map(e => e.model));
    assert.deepStrictEqual([...modelle], ["test-embed-1"]);
  });

  // 16: Kostenberechnung
  await pruefe("16 Kostenberechnung: Tokens × Preis, ohne Preis ehrlich null", async () => {
    assert.strictEqual(kostenSchaetzung(250000, 0.02), 0.005);
    assert.strictEqual(kostenSchaetzung(250000, undefined), null);
    const b = await runShadowPipeline(feste, createMemoryStore(), null, { ...CFG, dryRun: true });
    assert.strictEqual(b.kostenSchaetzung, null);
  });

  // 17: Mandantenneutralität
  await pruefe("17 Ablage-Einträge sind mandantenneutral (kein user_id, kein Mandant)", async () => {
    const s = createMemoryStore();
    await runShadowPipeline([ko("ko-a", { user_id: "mandant-x", priority: 99 })], s, mockProvider(8), CFG);
    const eintrag = s.eintraege["ko-a"];
    assert.ok(!("user_id" in eintrag) && !("mandant" in eintrag) && !("priority" in eintrag));
    // gleicher Inhalt, anderer Mandant → identischer Hash
    const hA = computeEmbeddingInputHash(ko("ko-a", { user_id: "mandant-x" }));
    const hB = computeEmbeddingInputHash(ko("ko-a", { user_id: "mandant-y" }));
    assert.strictEqual(hA, hB);
  });
  await pruefe("17b kein Mandant ist im Pipeline-Modul hartkodiert", () => {
    const quelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "embedding-shadow-pipeline.js"), "utf8");
    assert.ok(!/cem[-_]?ince/i.test(quelle));
  });

  // 18: Legacy-Matching unverändert
  await pruefe("18 Pipeline verändert weder Objekte noch den Legacy-Vektor", async () => {
    const objekt = ko("ko-a", { parteien: ["SPD"], tags: ["Pflege"] });
    const vorher = JSON.stringify(objekt);
    const legacyVorher = matching.computeFeatureVectorForKnowledgeObject(objekt);
    const s = createMemoryStore();
    await runShadowPipeline([objekt], s, mockProvider(8), CFG);
    assert.strictEqual(JSON.stringify(objekt), vorher, "Wissensobjekt wurde mutiert");
    assert.deepStrictEqual(matching.computeFeatureVectorForKnowledgeObject(objekt), legacyVorher);
    // und die Pipeline kennt keinen Understanding-/Matching-Pfad
    const quelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "embedding-shadow-pipeline.js"), "utf8");
    assert.ok(!/understanding|matching\.js|storage\.js/.test(quelle));
  });

  // 19+20: fehlendes Fachgebiet / Ebene unknown
  await pruefe("19 Objekte ohne Fachgebiet sind berechtigt und hash-stabil", () => {
    const ohne = ko("ko-a", { tags: [], policy_field: [] });
    const mit = ko("ko-a", { tags: ["Pflege"], policy_field: ["Gesundheit"] });
    const p = planeLauf([ohne], createMemoryStore(), CFG);
    assert.strictEqual(p.berechnen.length, 1);
    assert.strictEqual(computeEmbeddingInputHash(ohne), computeEmbeddingInputHash(mit),
      "Fachgebiet darf den Eingang nicht ändern (strukturierter Filter)");
  });
  await pruefe("20 Ebene unknown ist berechtigt und ändert den Eingang nicht", () => {
    const u = ko("ko-a", { political_level: "unknown" });
    const b = ko("ko-a", { political_level: "bund" });
    const p = planeLauf([u], createMemoryStore(), CFG);
    assert.strictEqual(p.berechnen.length, 1);
    assert.strictEqual(computeEmbeddingInputHash(u), computeEmbeddingInputHash(b));
  });

  // --- AB14-Fehlerszenarien ---
  await pruefe("F1 Provider-Timeout/Netzfehler: fehlgeschlagen + wiederaufnehmbar", async () => {
    const s = createMemoryStore();
    let n = 0;
    const kaputt = async () => { n += 1; throw new Error("timeout nach 30s"); };
    const b = await runShadowPipeline(feste, s, kaputt, { ...CFG, batchGroesse: 2 });
    assert.strictEqual(b.abgebrochen, true, "nach 2 Fehlbatches in Folge wird abgebrochen");
    assert.ok(b.fehlgeschlagen.length >= 4);
    const b2 = await runShadowPipeline(feste, s, mockProvider(8), CFG);
    assert.strictEqual(b2.berechnet, 5, "Wiederaufnahme berechnet alle nach Fehler");
  });
  await pruefe("F2 unvollständige Antwort (zu wenige Vektoren): betroffene Objekte fehlgeschlagen", async () => {
    const s = createMemoryStore();
    const provider = mockProvider(8, (r) => ({ vectors: r.vectors.slice(0, 1) }));
    const b = await runShadowPipeline([feste[0], feste[1], feste[2]], s, provider, { ...CFG, batchGroesse: 3 });
    assert.strictEqual(b.berechnet, 1);
    assert.strictEqual(b.fehlgeschlagen.length, 2);
    assert.ok(b.fehlgeschlagen.every(f => f.grund === "antwort: fehlt"));
  });
  await pruefe("F3 teilweiser Batch-Erfolg: gültige Objekte werden gespeichert", async () => {
    const s = createMemoryStore();
    const provider = mockProvider(8, (r) => { r.vectors[1] = [1, 2]; return { vectors: r.vectors }; });
    const b = await runShadowPipeline([feste[0], feste[1], feste[2]], s, provider, { ...CFG, batchGroesse: 3 });
    assert.strictEqual(b.berechnet, 2);
    assert.strictEqual(s.eintraege["ko-b"].status, "fehlgeschlagen");
    assert.strictEqual(s.eintraege["ko-a"].status, "aktuell");
  });
  await pruefe("F4 geänderter Input-Hash: genau dieses Objekt wird neu berechnet", async () => {
    const s = createMemoryStore();
    await runShadowPipeline(feste, s, mockProvider(8), CFG);
    const geaendert = feste.map((k, i) => i === 0 ? { ...k, was_ist_passiert: `${k.was_ist_passiert} Nachtrag: der Ausschuss hat erneut beraten.` } : k);
    const b = await runShadowPipeline(geaendert, s, mockProvider(8), CFG);
    assert.strictEqual(b.berechnet, 1);
    assert.strictEqual(b.aktuellUebersprungen, 4);
  });
  await pruefe("F5 doppelter Start mit gleicher Ablage bleibt konsistent", async () => {
    const s = createMemoryStore();
    const l1 = runShadowPipeline(feste, s, mockProvider(8), CFG);
    const l2 = runShadowPipeline(feste, s, mockProvider(8), CFG);
    const [b1, b2] = await Promise.all([l1, l2]);
    assert.strictEqual(Object.keys(s.eintraege).length, 5);
    assert.ok(Object.values(s.eintraege).every(e => e.status === "aktuell"));
    assert.ok(b1.berechnet + b2.berechnet >= 5);
  });
  await pruefe("F6 Versuchsdeckel: dauerhaft fehlschlagende Objekte werden nicht endlos wiederholt", async () => {
    const s = createMemoryStore();
    const kaputt = mockProvider(8, () => ({ vectors: [[NaN]] }));
    for (let i = 0; i < 4; i += 1) await runShadowPipeline([feste[0]], s, kaputt, CFG);
    assert.strictEqual(s.eintraege["ko-a"].attempt_count, 3);
    const b = await runShadowPipeline([feste[0]], s, kaputt, CFG);
    assert.strictEqual(b.versuchsdeckel.length, 1);
    assert.strictEqual(b.geplant, 0);
  });
  await pruefe("F7 Datei-Ablage: Zustand überlebt Abbruch (persistente Wiederaufnahme)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "embed-test-"));
    const datei = path.join(dir, "shadow.json");
    const s1 = createFileStore(datei);
    await runShadowPipeline(feste, s1, mockProvider(8), { ...CFG, maxObjekte: 3 });
    const s2 = createFileStore(datei); // neuer Prozess
    const b2 = await runShadowPipeline(feste, s2, mockProvider(8), CFG);
    assert.strictEqual(b2.aktuellUebersprungen, 3);
    assert.strictEqual(b2.berechnet, 2);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await pruefe("F8 Fixture-Testmenge: alle 56 Objekte sind berechtigt und planbar", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "embedding-testset-22b.json"), "utf8"));
    const objekte = fixture.objekte.map(o => ({ ...o, understanding_status: "complete" }));
    const p = planeLauf(objekte, createMemoryStore(), { ...CFG, dim: 256 });
    assert.strictEqual(p.berechnen.length, 56);
    assert.strictEqual(p.ausgeschlossen.length, 0);
    assert.strictEqual(fixture.goldstandard.length, 47);
    // Goldstandard referenziert nur Objekte der Testmenge
    const ids = new Set(objekte.map(o => o.id));
    assert.ok(fixture.goldstandard.every(g => ids.has(g.a) && ids.has(g.b)));
  });

  console.log(`\n${bestanden} bestanden, ${fehlgeschlagen} fehlgeschlagen`);
  if (fehlgeschlagen) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
