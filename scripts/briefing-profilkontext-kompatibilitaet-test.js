"use strict";
// Synthetische Speichervertraege. Kein HTTP, Browser, Modell oder echte Datenbank.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const B = require("../lib/helmut/briefing-speicher");
const Q = require("../lib/helmut/lage-textqualitaet");
const E = require("../lib/helmut/lage-entwurfsbeleg");
const S = require("../lib/helmut/storage");
const clone = structuredClone;
const profile = { id: "synthetisch-kompatibilitaet", committees: ["Petitionsausschuss"],
  deputyCommittees: ["Haushaltsausschuss"], focusTopics: ["Pflege"] };
const day = "2026-09-13", now = new Date(day + "T10:00:00Z");
// Alter Kontext explizit festgeschrieben, nicht aus neuer Implementierung abgeleitet.
const altKontext = { ebene: null, bundesland: null, partei: null, fraktion: null,
  wahlkreis: null, regierungsrolle: null, ausschuesse: ["Petitionsausschuss"],
  schwerpunkte: ["Pflege"], themengewichte: {} };
const briefing = { available: true, items: [{ title: "Gespeicherter synthetischer Bericht" }],
  currentHelmutState: {}, currentRadarState: {} };
const alt = { id: `bf-${profile.id}-mandatsbriefing-${day}`, user_id: profile.id,
  slot: B.SLOT, generated_at: now.toISOString(), payload: { version: 1, mandat: profile.id, tag: day,
    profilHash: B.hash(altKontext), briefing, lage: null,
    inhaltHash: B.hash({ briefing, lage: null }), pruefung: { bestanden: false, strukturellVollstaendig: false } } };
const store = row => ({ assertTenant: S.assertTenant, getRenderedBriefingV3: async (uid, slot, date, opts) => {
  assert.equal(uid, profile.id); assert.equal(slot, B.SLOT); assert.equal(date, day); assert.equal(opts.strict, true);
  return clone(row);
} });
const read = (row = alt, opts = {}) => B.lese({ userId: profile.id, day, profile, storage: store(row), ...opts });
let n = 0;
async function test(name, fn) { await fn(); n++; console.log("PASS " + name); }
(async () => {
  await test("Alter Beleg bleibt ausdruecklich historisch lesbar und bytegleich", async () => {
    const before = JSON.stringify(alt);
    assert.deepEqual(await read(alt, { historisch: true }), alt);
    assert.equal(JSON.stringify(alt), before);
  });
  await test("Historischer Hash ist exakt der bisherige Kontext", () => {
    assert.equal(B.profilHash(profile, 1), B.hash(altKontext));
    assert.notEqual(B.profilHash(profile), B.hash(altKontext));
    assert.equal(B.profilHash({ ...profile, deputyCommittees: [] }), B.hash(altKontext));
  });
  await test("Neue Abnahme akzeptiert keinen alten eingeschraenkten Profilkontext", async () => {
    await assert.rejects(read(), /briefing-nachweis-abweichend/);
    await assert.rejects(read(alt, { historisch: "true" }), /briefing-nachweis-abweichend/);
  });
  await test("Neuer Beleg erhaelt eine explizite Hashversion und strenges Ruecklesen", async () => {
    let row = null, writes = 0;
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async (_uid, slot) => slot === B.SLOT ? clone(row) : null,
      insertRenderedBriefingV3: async value => { writes++; row = clone(value); return { saved: true }; } };
    await B.materialisiere({ profile, userId: profile.id, now, briefing, storage });
    assert.equal(writes, 1); assert.equal(row.payload.profilHashVersion, 2);
    assert.equal(row.payload.profilHash, B.profilHash(profile));
    assert.deepEqual(await read(row), row);
    assert.deepEqual(await read(row, { historisch: true }), row);
    const changed = { ...profile, deputyCommittees: ["Finanzausschuss"] };
    await assert.rejects(read(row, { profile: changed, historisch: true }), /briefing-nachweis-abweichend/);
    const fehlt = clone(row); delete fehlt.payload.profilHashVersion;
    await assert.rejects(read(fehlt, { historisch: true }), /briefing-nachweis-abweichend/);
  });
  await test("Neue Versionskennung darf keinen alten Hash als neu geprueft ausgeben", async () => {
    for (const version of [2, 3, 0, null, "1", "2"]) {
      await assert.rejects(read({ ...alt, payload: { ...alt.payload, profilHashVersion: version } },
        { historisch: true }), /briefing-nachweis-abweichend/);
    }
  });
  await test("Auch historisch bleiben Mandant, Tag, Inhalt und alte Profilfelder zwingend", async () => {
    const rows = [ { ...alt, user_id: "fremd" }, { ...alt, id: "fremd" }, { ...alt, slot: "fremd" },
      { ...alt, payload: { ...alt.payload, tag: "2026-09-12" } },
      { ...alt, payload: { ...alt.payload, briefing: { available: false } } } ];
    for (const row of rows) await assert.rejects(read(row, { historisch: true }), /briefing-nachweis-abweichend/);
    await assert.rejects(read(alt, { historisch: true, profile: { ...profile, focusTopics: ["Wohnen"] } }), /briefing-nachweis-abweichend/);
  });
  await test("Alte Belege ohne Stellvertretung bleiben auch aktuell strukturell lesbar", async () => {
    assert.deepEqual(await read(alt, { profile: { ...profile, deputyCommittees: [] } }), alt);
  });
  await test("Keine alte Materialisierung wird umgeschrieben oder neu aufgebaut", async () => {
    let builds = 0, writes = 0;
    await assert.rejects(B.materialisiere({ profile, userId: profile.id, now, storage: {
      ...store(alt), insertRenderedBriefingV3: async () => { writes++; },
      ergaenzeUnvollstaendigesBriefing: async () => { writes++; }
    }, build: async () => { builds++; } }), /briefing-nachweis-abweichend/);
    assert.equal(builds, 0); assert.equal(writes, 0);
  });
  await test("Alter Entwurf bleibt erhalten und wird nicht unter neuem Kontext fortgesetzt", async () => {
    const args = { userId: profile.id, profile, runId: "nachlauf500-123456", phase: "entwurf", now,
      quellen: [], antwort: { paragraphs: [] } };
    const row = E.baue(args);
    row.payload.profilHash = B.hash(altKontext);
    const { inhaltHash, ...inhalt } = row.payload; row.payload.inhaltHash = B.hash(inhalt);
    const before = JSON.stringify(row);
    assert.equal(await E.leseFortsetzung(args, { getLageEntwurfsbeleg: async (_uid, id) => id.endsWith("-entwurf") ? clone(row) : null }), null);
    assert.equal(JSON.stringify(row), before);
  });
  await test("Historischer Serverzweig meldet den alten Pruefumfang ohne neue Arbeit", async () => {
    const src = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
    const start = src.indexOf("async function latestBriefingPayload(");
    const end = src.indexOf("\n// opts.slot", start); assert(start > 0 && end > start);
    let preparations = 0, reads = 0;
    const original = S.getRenderedBriefingV3;
    S.getRenderedBriefingV3 = async (...args) => { reads++; return store(alt).getRenderedBriefingV3(...args); };
    try {
      const latest = vm.runInNewContext(src.slice(start, end) + "\nlatestBriefingPayload", {
        require: name => { assert.equal(name, "./lib/helmut/briefing-speicher"); return B; },
        prepareBriefingResponse: value => { preparations++; return value; }
      });
      const result = await latest({ politicianId: profile.id, profile,
        url: new URL("https://example.invalid/api/briefing?gespeichert=" + day) });
      assert.deepEqual(result.items, briefing.items);
      assert.equal(result.gespeicherterNachweis.profilbindung.version, 1);
      assert.equal(result.gespeicherterNachweis.profilbindung.stellvertretungenImProfilhash, false);
      assert.equal(result.gespeicherterNachweis.pruefung.bestanden, false);
      assert.equal(reads, 1); assert.equal(preparations, 1);
    } finally { S.getRenderedBriefingV3 = original; }
  });
  console.log(`${n}/${n} synthetische Kompatibilitaetsgruppen erfolgreich. Kein Production oder Browsernachweis.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
