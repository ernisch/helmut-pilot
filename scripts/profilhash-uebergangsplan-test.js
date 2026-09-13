"use strict";
// Nur erfundene Profile, Texte und Urteile. Kein Modell, HTTP oder Datenbankschreiben.
const assert = require("node:assert/strict");
const P = require("./fixtures/profilhash-uebergangsplan");
const B = require("../lib/helmut/briefing-speicher");
const S = require("../lib/helmut/storage");
const A = require("../lib/helmut/briefing-aussagenbindung");
const L = require("../lib/helmut/briefing-lagebindung");
const gesamt = require("./fixtures/briefing-fachurteil");
const clone = structuredClone;
const now = new Date("2026-09-13T12:00:00Z"), day = "2026-09-13";
const profile = { id: "synthetisch-uebergang", committees: ["Petitionsausschuss"],
  deputyCommittees: ["Haushaltsausschuss"], focusTopics: ["Pflege"] };
const briefing = { available: true, items: [{ vorgangId: "vg-synthetisch", summary: "Der Ausschuss beraet einen Entwurf fuer den Haushalt." }] };
const oldContext = { ebene: null, bundesland: null, partei: null, fraktion: null,
  wahlkreis: null, regierungsrolle: null, ausschuesse: ["Petitionsausschuss"],
  schwerpunkte: ["Pflege"], themengewichte: {} };
const altbeleg = { id: `bf-${profile.id}-mandatsbriefing-${day}`, user_id: profile.id,
  slot: B.SLOT, generated_at: "2026-09-13T04:01:00Z", payload: { version: 1, mandat: profile.id,
    tag: day, profilHash: B.hash(oldContext), briefing: clone(briefing), lage: null,
    inhaltHash: B.hash({ briefing, lage: null }),
    pruefung: { bestanden: false, strukturellVollstaendig: false,
      fehler: ["lage-text-fehlt", "lage-quellenpruefung-fehlt"] } } };
const args = { userId: profile.id, profile, now, altbeleg };
const doc = { id: "rd-synthetisch", title: "Synthetische Haushaltsberatung", summary: briefing.items[0].summary,
  url: "https://example.invalid/dokument/haushalt", published_at: now.toISOString() };
const korrekturBasis = { kos: [{ id: "ko-synthetisch", vorgang_id: "vg-synthetisch" }],
  sourcesByVorgang: { "vg-synthetisch": [doc] } };
function basis(p = profile) {
  const result = { briefing, korrekturBasis, eingabe: A.baueEingabe({ briefing, profile: p,
    userId: p.id, day, ...korrekturBasis }) };
  const e = result.eingabe;
  const urteil = { version: A.VERSION, eingabeHash: e.eingabeHash, ursprungHash: e.eingabeHash,
    ausgelasseneVorgaenge: [], aussagen: e.aussagen.map(a => ({ ...a, sachlichGetragen: true,
      kontextGetragen: true, mandatsbezugGetragen: true,
      begruendung: "Erfundenes positives Urteil allein fuer diesen Vertragstest.",
      belege: [{ vorgangId: "vg-synthetisch", documentId: doc.id, feld: "auszug", text: doc.summary }] })) };
  urteil.gesamtpruefung = gesamt(result, urteil);
  return L.baue(result, urteil);
}
let n = 0;
async function test(name, fn) { await fn(); n++; console.log("PASS " + name); }
(async () => {
  const before = JSON.stringify(args);
  const plan = await P.plane(args);
  await test("Uebergang hat eigenen Schluessel und erhaelt vollstaendigen Altstand", () => {
    assert.notEqual(plan.ziel.id, altbeleg.id);
    assert.equal(plan.altbeleg.standHash, B.hash(altbeleg));
    assert.equal(plan.ziel.profilHash, B.profilHash(profile));
    assert.equal(JSON.stringify(args), before);
  });
  await test("Plan ohne neues Urteil erteilt weder Schreibrecht noch Fachabnahme", () => {
    assert.equal(plan.naechstesTor, "neue-fachbindung-fehlt");
    for (const key of ["speicherFreigegeben", "auslieferbar", "fachlichAbgenommen", "automatischerStart"])
      assert.equal(plan[key], false);
  });
  await test("Eigenstaendige aktuelle Fachbindung wird durch bestehende Pruefer bestaetigt", async () => {
    const neu = basis(), result = await P.plane({ ...args, neueFachbasis: neu });
    assert.equal(result.ziel.aussagenEingabeHash, neu.eingabe.eingabeHash);
    assert.equal(result.ziel.aussagenUrteilHash, B.hash(neu.urteil));
    assert.equal(result.naechstesTor, "speicher-und-leser-integration-offen");
    assert.equal(result.auslieferbar, false);
  });
  await test("Altes Urteil ohne Stellvertretung kann nicht uebernommen werden", async () => {
    await assert.rejects(P.plane({ ...args, neueFachbasis: basis({ ...profile, deputyCommittees: [] }) }), /lagebindung-abweichend/);
  });
  await test("Negatives Einzelurteil bleibt ablehnend", async () => {
    const neu = basis(); neu.urteil.aussagen[0].mandatsbezugGetragen = false;
    await assert.rejects(P.plane({ ...args, neueFachbasis: neu }), /lagebindung-abweichend/);
  });
  await test("Ein nachtraeglich geaendertes positives Urteil entwertet den gebundenen Plan", async () => {
    const neu = basis(), gebunden = await P.plane({ ...args, neueFachbasis: neu });
    neu.urteil.aussagen[0].begruendung += " Ergaenzte synthetische Begruendung.";
    await assert.rejects(P.pruefeFrisch(gebunden, { ...args, neueFachbasis: neu }), /uebergang-nicht-vorbereitet/);
  });
  await test("Fehlendes Gesamturteil kann durch Einzelurteil nicht ersetzt werden", async () => {
    const neu = basis(); delete neu.urteil.gesamtpruefung;
    await assert.rejects(P.plane({ ...args, neueFachbasis: neu }), /lagebindung-abweichend/);
  });
  await test("Beschaedigter Inhalt und fremder Mandant stoppen die Vorbereitung", async () => {
    const bad = clone(altbeleg); bad.payload.briefing.items[0].summary += " manipuliert";
    await assert.rejects(P.plane({ ...args, altbeleg: bad }), /briefing-nachweis-abweichend/);
    await assert.rejects(P.plane({ ...args, userId: "synthetisch-fremd" }), /uebergang-nicht-vorbereitet/);
    await assert.rejects(P.plane({ ...args, altbeleg: { ...altbeleg, user_id: "synthetisch-fremd" } }), /briefing-nachweis-abweichend/);
  });
  await test("Vollstaendiger Altstand und bereits aktueller Vertrag sind nicht dieser Uebergang", async () => {
    const complete = clone(altbeleg); complete.payload.pruefung.strukturellVollstaendig = true;
    await assert.rejects(P.plane({ ...args, altbeleg: complete }), /uebergang-nicht-vorbereitet/);
    const current = clone(altbeleg); current.payload.profilHashVersion = 2; current.payload.profilHash = B.profilHash(profile);
    await assert.rejects(P.plane({ ...args, altbeleg: current }), /uebergang-nicht-vorbereitet/);
  });
  await test("Kein Profilwechsel und fremder Tag erzeugen keinen Uebergang", async () => {
    await assert.rejects(P.plane({ ...args, profile: { ...profile, deputyCommittees: [] } }), /uebergang-nicht-vorbereitet/);
    await assert.rejects(P.plane({ ...args, now: new Date("2026-09-14T12:00:00Z") }), /briefing-nachweis-abweichend/);
  });
  await test("Plan ist wiederholbar und erkennt nachtraeglich geaenderten Altbeleg", async () => {
    assert.deepEqual(await P.pruefeFrisch(plan, args), plan);
    const changed = clone(altbeleg); changed.generated_at = "2026-09-13T05:01:00Z";
    await assert.rejects(P.pruefeFrisch(plan, { ...args, altbeleg: changed }), /uebergang-nicht-vorbereitet/);
  });
  await test("Geaenderte Stellvertretung oder manipuliertes Ziel entwerten den Plan", async () => {
    await assert.rejects(P.pruefeFrisch(plan, { ...args, profile: { ...profile, deputyCommittees: ["Finanzausschuss"] } }), /uebergang-nicht-vorbereitet/);
    await assert.rejects(P.pruefeFrisch({ ...plan, auslieferbar: true }, args), /uebergang-nicht-vorbereitet/);
  });
  await test("Bestehender Speicher kann parallele Kennung einfuegen ohne Altzeile zu ersetzen", async () => {
    const rows = new Map([[altbeleg.id, clone(altbeleg)]]);
    const entry = { ...clone(altbeleg), id: plan.ziel.id };
    // Nur die Adressierbarkeit wird geprueft. Diese bewusst ungepruefte
    // Payloadkopie ist KEIN gueltiger neuer Beleg und wird niemals ausgeliefert.
    let writes = 0;
    const deps = { bereit: true, request: async (url, options) => {
      assert(url.includes('user_id=eq.' + profile.id));
      assert.equal(options.method, "POST");
      assert.match(options.headers.Prefer, /ignore-duplicates/);
      const row = JSON.parse(options.body); if (rows.has(row.id)) return [];
      writes++; rows.set(row.id, row); return [clone(row)];
    } };
    assert.equal((await S.insertRenderedBriefingV3(entry, deps)).saved, true);
    assert.equal((await S.insertRenderedBriefingV3(entry, deps)).reason, "existing-result");
    assert.equal(writes, 1); assert.deepEqual(rows.get(altbeleg.id), altbeleg);
    assert.equal(rows.size, 2);
  });
  await test("Ungepruefte Kopie am neuen Schluessel gilt nicht als aktueller Nachfolger", async () => {
    let requested;
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async (id, slot, date, opts) => {
      requested = opts.profilHash ? plan.ziel.id : `bf-${id}-${slot}-${date}`;
      return { ...clone(altbeleg), id: requested };
    } };
    await assert.rejects(B.lese({ userId: profile.id, profile, day, storage }), /briefing-nachweis-abweichend/);
    assert.equal(requested, plan.ziel.id);
    assert.deepEqual(await B.lese({ userId: profile.id, profile, day, historisch: true, storage }), altbeleg);
  });
  console.log(`${n}/${n} synthetische Uebergangsgruppen bestanden. Entwurfspruefung, keine reale Fachabnahme.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
