"use strict";

// Nur erfundene Vertragsdaten. Kein Modell, HTTP, Import oder persistenter Speicher.
const assert = require("node:assert/strict");
const A = require("../lib/helmut/briefing-aussagenbindung");
const B = require("../lib/helmut/briefing-speicher");
const L = require("../lib/helmut/briefing-lagebindung");
const U = require("../lib/helmut/briefing-urteilsimport");
const S = require("../lib/helmut/storage");
const F = require("./fixtures/briefing-fachurteil");
const now = new Date(), day = require("../lib/helmut/briefing-frische").berlinTagKey(now);
const profile = { id: "synthetisch-kontextreview", committees: ["Petitionsausschuss"],
  deputyCommittees: ["Haushaltsausschuss"], focusTopics: ["Pflege"] };
const oldContext = { ebene: null, bundesland: null, partei: null, fraktion: null,
  wahlkreis: null, regierungsrolle: null, ausschuesse: ["Petitionsausschuss"],
  schwerpunkte: ["Pflege"], themengewichte: {} };
const doc = { id: "rd-synthetisch", title: "Beratung eines Haushaltsentwurfs",
  summary: "Der Ausschuss beraet einen Entwurf fuer den Haushalt.",
  url: "https://example.invalid/dokument/haushalt", published_at: now.toISOString() };
const kos = [{ id: "ko-synthetisch", vorgang_id: "vg-synthetisch" }];
const sourcesByVorgang = { "vg-synthetisch": [doc] };
const briefing = { available: true, items: [{ vorgangId: "vg-synthetisch", summary: doc.summary }] };
function build(p = profile, historical = false) {
  const eingabe = A.baueEingabe({ briefing, profile: p, userId: p.id, day, kos, sourcesByVorgang });
  if (historical) {
    // Exakter frueherer Fachkontext, keine rekonstruierte Modellantwort.
    // Der schon damals vorhandene Hash des ganzen Rohprofils bleibt erhalten.
    eingabe.profil = structuredClone(oldContext);
    eingabe.profilHash = B.hash(oldContext);
    const { eingabeHash, ...inhalt } = eingabe;
    eingabe.eingabeHash = B.hash(inhalt);
  }
  return { briefing, eingabe, korrekturBasis: { kos, sourcesByVorgang } };
}
function verdict(result) {
  const e = result.eingabe;
  const urteil = { version: A.VERSION, eingabeHash: e.eingabeHash, ursprungHash: e.eingabeHash,
    ausgelasseneVorgaenge: [], aussagen: e.aussagen.map(a => ({ ...a,
      sachlichGetragen: true, kontextGetragen: true, mandatsbezugGetragen: true,
      begruendung: "Erfundenes positives Urteil ausschliesslich zum Vertragstest.",
      belege: [{ vorgangId: "vg-synthetisch", documentId: doc.id, feld: "auszug", text: doc.summary }] })) };
  urteil.gesamtpruefung = F(result, urteil);
  return urteil;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  const old = build(profile, true), current = build(), oldVerdict = verdict(old);
  const before = JSON.stringify({ profile, old, current, oldVerdict });
  await test("Historisches Urteil bleibt historisch gueltig, gilt aber nicht fuer neuen Kontext", () => {
    assert.equal(A.pruefe(old.eingabe, oldVerdict).bereit, true);
    assert.equal(A.pruefe(current.eingabe, oldVerdict).grund, "briefing-aussagenpruefung-veraltet");
    assert.throws(() => U.pruefeUrteil(current, oldVerdict), /urteilsimport-einzelurteil-abgelehnt/);
    U.pruefeUrteil(current, verdict(current));
  });
  await test("Echter Nachlaufleser lehnt alten Ursprung vor Ausgabe einer Lagebindung ab", async () => {
    let reads = 0, builds = 0;
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async (id, slot, date, opts) => {
      reads++; assert.equal(id, profile.id); assert.equal(date, day); assert.equal(opts.strict, true);
      return { id: `bf-${id}-${slot}-${day}`, user_id: id, slot, payload: structuredClone(oldVerdict) };
    } };
    await assert.rejects(A.leseFuerNachlauf({ profile, userId: profile.id, now, storage,
      build: async () => { builds++; return current; } }), /briefing-aussagen-auslassung-abweichend/);
    assert.equal(reads, 1); assert.equal(builds, 1);
  });
  await test("Gebundene Lage weist Alturteil sowie geaenderte Stellvertretung ab", () => {
    assert.throws(() => L.pruefe(L.baue(old, oldVerdict), profile, profile.id, now), /briefing-lagebindung-abweichend/);
    const basis = L.baue(current, verdict(current));
    assert.equal(L.pruefe(basis, profile, profile.id, now).eingabeHash, current.eingabe.eingabeHash);
    assert.throws(() => L.pruefe(basis, { ...profile, deputyCommittees: ["Finanzausschuss"] }, profile.id, now),
      /briefing-lagebindung-abweichend/);
    const bad = verdict(current); bad.aussagen[0].mandatsbezugGetragen = false;
    assert.throws(() => L.pruefe(L.baue(current, bad), profile, profile.id, now), /briefing-lagebindung-abweichend/);
  });
  await test("Ohne Stellvertretung bleibt der ganze bisherige Aussagenvertrag identisch", () => {
    const p = { ...profile, deputyCommittees: [] };
    assert.deepEqual(build(p).eingabe, build(p, true).eingabe);
    assert.equal(A.pruefe(build(p).eingabe, verdict(build(p, true))).bereit, true);
  });
  await test("Historischer Hash bindet Stellvertretungen nicht, neuer Hash erkennt Entfernen und Wechsel", () => {
    for (const deputyCommittees of [[], ["Finanzausschuss"]]) {
      const p = { ...profile, deputyCommittees };
      assert.equal(B.profilHash(p, 1), B.hash(oldContext));
      assert.notEqual(B.profilHash(p), B.profilHash(profile));
    }
    assert.equal(JSON.stringify({ profile, old, current, oldVerdict }), before);
  });
  console.log(`${count}/${count} neue synthetische Verbrauchergruppen bestanden. Keine Fachabnahme.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
