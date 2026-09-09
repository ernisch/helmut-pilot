"use strict";
const assert = require("node:assert/strict");
const Q = require("../lib/helmut/lage-textqualitaet");
const E = require("../lib/helmut/lage-quellenbeleg");
const B = require("../lib/helmut/briefing-speicher");
const S = require("../lib/helmut/storage");
const D = require("../lib/helmut/dedup");
const T = require("../lib/helmut/testkohorte-direkt500");
const { welt, env } = require("./fixtures/direkt500");
const clone = x => structuredClone(x);
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log("PASS " + name); }
const docs = [{ vorgang_id: "vg-test", quellenbelege: [{ quelle_id: "q-1", titel: "Das Kabinett beraet ueber Kita-Standards.", auszug: "Ein Beschluss liegt noch nicht vor.", url: "https://example.org/kita" },
  { quelle_id: "q-2", titel: "Netznutzer legen einen Vorschlag zur Energiewende vor.", auszug: "", url: "https://example.org/energie" }] }];
const paragraphs = [{ text: docs[0].quellenbelege[0].titel, vorgang_ids: ["vg-test"] },
  { text: docs[0].quellenbelege[1].titel, vorgang_ids: ["vg-test"] }];
const review = { pruefungen: paragraphs.map((p, absatz) => ({ absatz, quelle_id: "q-" + (absatz + 1), beleg: p.text,
  vollstaendig_belegt: true, themenrein: true, profilbezug: true, keine_fuelltexte: true })) };
(async () => {
  await test("Dokumentgattung und Ressort verbinden keine verschiedenen Ereignisse", () => {
    const V = require("../lib/helmut/vorgang-identity");
    const d = (id, title) => ({ id, title, published_at: "2026-09-09T08:00:00Z" });
    const kita = d("k", "Kabinett billigt Gesetzentwurf fuer bundesweite Kita-Standards");
    const energie = d("e", "Interessenvertretung legt Gesetzentwurf zur Digitalisierung der Energiewende vor");
    const wahl = d("w", "Nach Wahl in Sachsen-Anhalt: Merz warnt die AfD - Politik - SZ.de");
    const kabel = d("l", "Neue Manipulationen bei Stromleitungen in Sachsen und NRW entdeckt - Politik - SZ.de");
    assert.equal(V.docsShareEvent(kita, energie).gleich, false);
    assert.equal(V.docsShareEvent(wahl, kabel).gleich, false);
    assert.equal(require("../lib/helmut/briefing-quellenqualitaet").themenrein([kita, energie]), false);
    assert.equal(require("../lib/helmut/briefing-quellenqualitaet").themenrein([kita, { ...kita, id: "k2" }]), true);
  });
  await test("Alte Briefing- und Radartexte erhalten aus einer Ueberschrift kein erfundenes Amt oder einen Beschluss", () => {
    const K = require("../lib/helmut/briefing-quellenqualitaet");
    const quellen = [{ title: "Baerbock uebergibt Vorsitz der UNO-Generalversammlung an Nachfolger aus Bangladesch", summary: null }];
    assert.equal(K.quellengebunden({ display_summary: "Außenministerin Annalena Baerbock hat den Vorsitz uebergeben." }, quellen), false);
    assert.equal(K.quellengebunden({ display_summary: "Baerbock uebergibt den Vorsitz der UNO-Generalversammlung." }, quellen), true);
    assert.equal(K.quellengebunden({ was_ist_passiert: "Das Kabinett hat die neuen Standards beschlossen." },
      [{ title: "Vorschlag fuer neue Standards vorgelegt" }]), false);
    assert.equal(K.quellengebunden({ was_ist_passiert: "Das Kabinett hat die neuen Standards beschlossen." },
      [{ title: "Neue Standards beschlossen" }]), true);
  });
  await test("RSS Originalauszug bleibt gekuerzt erhalten, Rohpayload und Skript fehlen", () => {
    const r = D.toRawDocumentRow({ title: "Neuer Entwurf", url: "https://example.org/a", content: "<script>ANGRIFF</script><p>Die Beratung beginnt morgen. " + "Kontext ".repeat(100) + "</p>", author: "private Autorendaten" });
    assert(r.summary.startsWith("Die Beratung beginnt morgen.")); assert(r.summary.length <= D.SUMMARY_MAX);
    assert(!JSON.stringify(r).includes("ANGRIFF")); assert(!JSON.stringify(r).includes("private Autorendaten"));
    assert(!Object.hasOwn(r.raw, "content"));
    assert.equal(D.sourceExcerpt({ title: "Nur eine Ueberschrift", sourceName: "Verlag", content: "Nur eine Ueberschrift Verlag" }), null);
  });
  await test("Zwei Artikel derselben Vorgangskennung bleiben einzeln belegt", () => {
    const r = Q.pruefe(paragraphs, docs, review); assert.equal(r.ok, true);
    assert.deepEqual(r.paragraphs.map(p => p.quellen_ids), [["q-1"], ["q-2"]]);
    assert.equal(r.qualitaet.vollstaendigeFaktenpruefung, false);
  });
  await test("Ein einzelner abgelehnter Sachverhalt verwirft den ganzen Text", () => {
    for (const field of ["vollstaendig_belegt", "themenrein", "profilbezug", "keine_fuelltexte"]) {
      const r = clone(review); r.pruefungen[1][field] = false;
      assert.equal(Q.pruefe(paragraphs, docs, r).grund, "ai-text-source-support");
    }
  });
  await test("Unbelegte Ministerrolle und gefaelschte Zitate erhalten keinen Quellenbeleg", () => {
    const r = clone(review); r.pruefungen[0].beleg = "Die Aussenministerin hat beschlossen";
    assert.equal(Q.pruefe(paragraphs, docs, r).grund, "ai-text-evidence-quote");
    r.pruefungen[0].beleg = paragraphs[0].text; r.pruefungen[0].quelle_id = "q-fremd";
    assert.equal(Q.pruefe(paragraphs, docs, r).grund, "ai-text-source-support");
  });
  await test("Fehlender, doppelter oder falscher Absatzindex ist kein vollstaendiges Urteil", () => {
    for (const rows of [review.pruefungen.slice(0, 1), [review.pruefungen[0], review.pruefungen[0]],
      [review.pruefungen[0], { ...review.pruefungen[1], absatz: 9 }]])
      assert.equal(Q.pruefe(paragraphs, docs, { pruefungen: rows }).ok, false);
  });
  await test("Paragraphen verweisen nur auf ihre eigentliche Quelle", () => {
    const p = Q.pruefe(paragraphs, docs, review).paragraphs[0];
    const r = require("../lib/helmut/lage").resolveParagraphSources(p, { "vg-test": [
      { quelleId: "q-1", url: docs[0].quellenbelege[0].url }, { quelleId: "q-2", url: docs[0].quellenbelege[1].url }] });
    assert.deepEqual(r.map(s => s.url), [docs[0].quellenbelege[0].url]);
  });
  await test("Teilnahme PATCH veraendert nur aktiv, filtert Mandat und Versionsstand, liest unabhaengig zurueck", async () => {
    let row = { user_id: "test-kohorte-a-001", aktiv: false, updated_at: "2026-09-09T08:00:00Z", geloescht_at: null,
      profil_extras: { provisionedBy: "helmut-provisioning" }, partei: "Test" };
    let reads = 0, writes = 0;
    const r = await S.setTestProfileActive(row.user_id, true, { bereit: true, request: async (url, opts) => {
      const q = new URL(url, "https://example.invalid").searchParams;
      assert.equal(q.get("user_id"), "eq." + row.user_id);
      if (opts.method === "GET") { reads++; return [clone(row)]; }
      writes++; assert.equal(q.get("aktiv"), "eq.false"); assert.equal(q.get("updated_at"), "eq." + row.updated_at);
      const body = JSON.parse(opts.body);
      assert.deepEqual(Object.keys(body).sort(), ["aktiv", "updated_at"]); assert.equal(body.aktiv, true);
      assert(Number.isFinite(Date.parse(body.updated_at))); Object.assign(row, body); return [clone(row)];
    } });
    assert.equal(r.ok, true); assert.equal(writes, 1); assert.equal(reads, 2);
    await assert.rejects(S.setTestProfileActive("reales-mandat", false, { bereit: true }), /ziel-ungueltig/);
  });
  await test("CAS Konflikt beendet Aktivierung ohne Wiederholung", async () => {
    let writes = 0;
    await assert.rejects(S.setTestProfileActive("test-kohorte-a-001", true, { bereit: true, request: async (_url, o) => {
      if (o.method === "GET") return [{ user_id: "test-kohorte-a-001", aktiv: false, updated_at: "2026-09-09T08:00:00Z", geloescht_at: null,
        profil_extras: { provisionedBy: "helmut-provisioning" } }];
      writes++; return [];
    } }), /schreibstatus-unklar/); assert.equal(writes, 1);
  });
  await test("495 bestehende Testprofile sind aus fuenf aktiven realen Profilen reaktivierbar", async () => {
    const w = welt(); assert.equal((await T.fuehreAus({ vorgang: "provisionierung", env: env("provisionierung"), deps: w.deps })).ok, true);
    for (const [id, row] of w.mandate) if (id.startsWith("test-kohorte-")) row.aktiv = false;
    const before = w.snapshot(); const r = await T.fuehreAus({ vorgang: "reaktivierung", env: env("reaktivierung"), deps: { ...w.deps,
      schreibe: ({ id }) => w.storage.setTestProfileActive(id, true) } });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.bestaetigt, 495); assert.equal(r.aktiv, 500);
    assert.deepEqual(w.snapshot().auth.users, before.auth.users); assert.deepEqual(w.snapshot().identitaeten, before.identitaeten);
    w.mandate.get("test-kohorte-a-001").partei = "veraendert";
    assert.throws(() => T.pruefeSnapshot(w.snapshot(), "reaktivierung"), /kohorteninhalt/);
  });
  await test("Ein Laufstatus ersetzt keinen gespeicherten Briefinginhalt", async () => {
    const profile = { id: "test-kohorte-a-001", committees: ["Bildung"] }, now = new Date("2026-09-09T10:00:00Z");
    let row = null, builds = 0;
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async (_id, slot) => slot === B.SLOT ? clone(row) : null,
      insertRenderedBriefingV3: async e => { row = clone(e); return { saved: true }; } };
    const args = { profile, userId: profile.id, now, storage,
      build: async () => { builds++; return { available: true, engine: "v3", items: [{ title: "Kita-Beratung" }], currentHelmutState: {}, currentRadarState: {} }; } };
    const r = await B.materialisiere(args); assert.equal(r.gespeichert, true); assert.equal(r.qualitaetBestanden, false);
    assert(row.payload.briefing.items.length); assert(row.payload.pruefung.fehler.includes("lage-text-fehlt"));
    await B.materialisiere(args); assert.equal(builds, 1, "Vorhandener gleicher Stand erzeugt keine pauschale Neuberechnung");
    row.payload.briefing.items[0].title = "Fremder Inhalt";
    await assert.rejects(B.lese({ userId: profile.id, day: "2026-09-09", profile, storage }), /nachweis-abweichend/);
  });
  await test("Wortgleiche lange Texte zwischen Radar und Briefing sind keine vollstaendige Qualitaetsabnahme", () => {
    const text = "Das Kabinett beraet nach Angaben der Quelle den vorgelegten Entwurf fuer bundesweite Standards in Kindertagesstaetten.";
    const r = B.pruefeInhalt({ available: true, items: [{ title: "Kita-Beratung" }],
      currentHelmutState: { summary: text }, currentRadarState: { summary: text } },
      { paragraphs, qualitaet: { version: 1 } });
    assert.equal(r.strukturellVollstaendig, false);
    assert(r.fehler.includes("wiederholung-zwischen-ansichten"));
    assert.deepEqual(r.wiederholungen, ["briefing.currentRadarState.summary"]);
  });
  await test("Ausgebliebener Readback und gestoerter Quellenspeicher bleiben Fehler", async () => {
    const profile = { id: "test-kohorte-a-001" };
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async () => null, insertRenderedBriefingV3: async () => ({ saved: true }) };
    await assert.rejects(B.materialisiere({ profile, userId: profile.id, storage, briefing: { available: false, reason: "store-error" } }), /speicherquelle-gestoert/);
    await assert.rejects(B.materialisiere({ profile, userId: profile.id, storage, briefing: { available: false, reason: "keine-vorgaenge", items: [] } }), /nicht-bestaetigt/);
  });
  await test("Derselbe gebundene Artikeltitel in beiden Ansichten ist ein erlaubter Alias", () => {
    const title = "Der Ausschuss beraet den vorgelegten Entwurf zur Finanzierung kommunaler Beratungsstellen in den Gemeinden";
    const b = { available: true, items: [{ title: "Beratung" }],
      currentHelmutState: { primaryItem: { id: "vg-fixture", sourceIds: ["rd-fixture"], title } },
      currentRadarState: { articles: [{ vorgangId: "vg-fixture", documentId: "rd-fixture", title }] } };
    const lage = { paragraphs, qualitaet: { version: 1 } };
    assert.equal(B.pruefeInhalt(b, lage).strukturellVollstaendig, true);
    for (const patch of [{ vorgangId: "vg-fremd" }, { documentId: "rd-fremd" }, { documentId: null }]) {
      const changed = clone(b); Object.assign(changed.currentRadarState.articles[0], patch);
      assert(B.pruefeInhalt(changed, lage).fehler.includes("wiederholung-zwischen-ansichten"));
    }
    b.currentHelmutState.primaryItem.summary = title;
    b.currentRadarState.articles[0].summary = title;
    assert(B.pruefeInhalt(b, lage).fehler.includes("wiederholung-zwischen-ansichten"));
    assert(B.pruefeInhalt(b, { ...lage, paragraphs: [{ text: title }] }).fehler.includes("wiederholung-zwischen-ansichten"));
  });
  await test("Ein spaeter gespeicherter Lage Text ergaenzt gezielt den zuvor unvollstaendigen Briefingstand", async () => {
    const profile = { id: "test-kohorte-a-001" }, now = new Date("2026-09-09T10:00:00Z");
    let row = null, lage = null, replacements = 0;
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async (_id, slot) => clone(slot === B.SLOT ? row : lage),
      insertRenderedBriefingV3: async e => { row = clone(e); return { saved: true }; },
      ergaenzeUnvollstaendigesBriefing: async (before, entry) => {
        assert.deepEqual(entry.payload.vorherigerStand, before); replacements++; row = clone(entry); return { saved: true };
      } };
    const briefing = { available: true, items: [{ title: "Kita-Beratung" }], currentHelmutState: {}, currentRadarState: {} };
    await B.materialisiere({ profile, userId: profile.id, now, storage, briefing });
    const before = clone(row);
    lage = { payload: { paragraphs: Q.pruefe(paragraphs, docs, review).paragraphs, qualitaet: { version: 1 }, quellen: docs } };
    const r = await B.materialisiere({ profile, userId: profile.id, now: new Date(now.getTime() + 1000), storage, briefing });
    assert.equal(r.vollstaendig, true); assert.equal(r.qualitaetBestanden, false); assert.equal(replacements, 1);
    assert.deepEqual(row.payload.vorherigerStand, before);
    assert.equal(B.lageAusgabe(row.payload.lage).paragraphs[0].sources[0].url, "https://example.org/kita");
    await B.materialisiere({ profile, userId: profile.id, now, storage, briefing }); assert.equal(replacements, 1);
  });
  await test("Mandatsergebnisse ueberleben den relationalen Speicherweg ohne Texte oder Identitaeten", () => {
    const r = S.sanitizeProcessRun({ runId: "test-1", process: "test", mandatsErgebnisse: [{ mandatHash: T.hash("test-kohorte-a-001"),
      gestartet: true, lageGespeichert: false, briefingGespeichert: false, grund: "ai-text-source-support", text: "Darf nicht gespeichert werden" }] });
    const rel = require("../lib/helmut/blob-relational");
    const roundtrip = rel.relationalRowToProcessRun(rel.processRunToRelationalRow(r));
    assert.deepEqual(roundtrip.mandatsErgebnisse, r.mandatsErgebnisse);
    assert(!JSON.stringify(roundtrip).includes("Darf nicht")); assert(!JSON.stringify(roundtrip).includes("test-kohorte"));
  });
  console.log(`${checks}/${checks} Vollstaendigkeitspruefungen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
