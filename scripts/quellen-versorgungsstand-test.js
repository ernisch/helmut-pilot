"use strict";
// Deklarierte lokale Queue-/Speicherantworten; keine Modelle, Originalabrufe oder Productionwrites.
const A = require("node:assert/strict");
const V = require("../lib/helmut/quellen-versorgungsstand");
const B = require("../lib/helmut/briefing-speicher");
const C = require("../lib/helmut/briefingContract");
const M = require("../lib/helmut/morgenversorgung");
const now = new Date("2026-11-09T05:15:00Z"), tag = "2026-11-09";
const env = { HELMUT_QUELLEN_ARBEITSFENSTER: "on" };
const profile = { id: "test-versorgung", focusTopics: ["Pflege"] };
const signal = zustand => ({ version: 1, zustand });
const base = () => ({ planungsrest: { lesen: async () => ({ zustand: "fertig" }),
  offene: async () => ({ plaene: [], weitereVorhanden: false }) },
  offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 0, fehlgeschlagen: 0 }) });
const lese = deps => V.lese({ mandat: profile.id, jetztMs: now.getTime(), env, deps });
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
(async () => {
  await test("Default aus verursacht keine Statuslesung", async () => {
    A.equal(await V.lese({ env: {}, deps: new Proxy({}, { get: () => { throw Error("IO"); } }) }), null);
  });
  await test("Fehlendes Manifest, Datenlesefehler und unklare Zaehler bleiben unbekannt", async () => {
    for (const mutate of [d => { d.planungsrest.lesen = async () => null; },
      d => { d.planungsrest.lesen = async () => { throw Error("timeout"); }; },
      d => { d.offeneVorbedingungen = async () => ({ verfuegbar: true, offen: 0 }); },
      d => { d.offeneVorbedingungen = async () => ({ verfuegbar: false, offen: 0, fehlgeschlagen: 0 }); }]) {
      const d = base(); mutate(d); A.deepEqual(await lese(d), signal("unbekannt"));
    }
  });
  await test("Planrest, Budgetpause und Terminalfehler geben offene Versorgung", async () => {
    for (const mutate of [d => { d.planungsrest.lesen = async () => ({ zustand: "offen" }); },
      d => { d.planungsrest.offene = async () => ({ plaene: [{ tag: "2026-11-08" }], weitereVorhanden: false }); },
      d => { d.offeneVorbedingungen = async () => ({ verfuegbar: true, offen: 1, fehlgeschlagen: 0 }); },
      d => { d.offeneVorbedingungen = async () => ({ verfuegbar: true, offen: 0, fehlgeschlagen: 1 }); }]) {
      const d = base(); mutate(d); A.deepEqual(await lese(d), signal("offen"));
    }
  });
  await test("Nur Tagesfenster und eigenes Mandat werden an bestehenden RPC gebunden", async () => {
    const d = base(), calls = [];
    d.offeneVorbedingungen = async x => { calls.push(x); return { verfuegbar: true, offen: 0, fehlgeschlagen: 0 }; };
    A.deepEqual(await lese(d), signal("kein-bekannter-rueckstand"));
    A.equal(calls.length, 2); A(calls.every(x => x.mandat === profile.id));
    A(calls[0].fenster.every(f => f.startsWith(tag)));
    A.deepEqual(calls[0].typen, ["source_fetch", "document_understanding", "mandate_projection"]);
    A.deepEqual(calls[1], { fenster: null, typen: ["document_understanding"], mandat: profile.id });
  });
  await test("Gestriger Budgetrest verhindert Quiet trotz beider fertig eingeplanter Tage", async () => {
    const queue = require("./fixtures/jobqueue-speicher-treiber").erzeugeSpeicherWarteschlange({ now: () => now.getTime() });
    const old = await queue.enqueue({ jobType: "document_understanding", idempotencyKey: "gleiche-artikelversion",
      freshnessWindow: "2026-11-08T00Z", tenantId: null });
    const failed = await queue.enqueue({ jobType: "document_understanding", idempotencyKey: "historischer-endfehler",
      freshnessWindow: "2026-11-07T00Z", tenantId: null });
    queue.hole(failed.id).status = "fehlgeschlagen";
    await queue.enqueue({ jobType: "document_understanding", idempotencyKey: "privater-fremdauftrag",
      freshnessWindow: "2026-11-08T00Z", tenantId: "fremdes-mandat" });
    const wieder = await queue.enqueue({ jobType: "document_understanding", idempotencyKey: "gleiche-artikelversion",
      freshnessWindow: tag + "T00Z", tenantId: null });
    A.equal(wieder.id, old.id); A.equal(wieder.neu, false);
    A.equal(queue.hole(old.id).freshness_window, "2026-11-08T00Z");
    const d = base(); d.offeneVorbedingungen = queue.offeneVorbedingungen;
    const stand = await lese(d); A.deepEqual(stand, signal("offen"));
    A.equal(C.toBriefingContractV3({ profile, now, versorgung: stand }).currentHelmutState.emptyState.kind, "gap");
    queue.hole(old.id).status = "laeuft"; A.deepEqual(await lese(d), signal("offen"));
    queue.hole(old.id).status = "erledigt";
    A.deepEqual(await lese(d), signal("kein-bekannter-rueckstand"), "Historische Endfehler und fremde Privatjobs sind kein ewiger Rueckstand");
    d.offeneVorbedingungen = async ({ fenster }) => fenster ? { verfuegbar: true, offen: 0, fehlgeschlagen: 0 } : { verfuegbar: false };
    A.deepEqual(await lese(d), signal("unbekannt"));
  });
  const rows = new Map(); let updates = 0;
  const storage = { assertTenant: require("../lib/helmut/storage").assertTenant,
    getRenderedBriefingV3: async (id, slot, day) => structuredClone(rows.get(`bf-${id}-${slot}-${day}`) || null),
    insertRenderedBriefingV3: async entry => { rows.set(entry.id, structuredClone(entry)); return { saved: true }; },
    ergaenzeUnvollstaendigesBriefing: async (before, entry) => {
      A.equal(before.payload.pruefung.strukturellVollstaendig, false);
      A.deepEqual(rows.get(before.id), before); A.deepEqual(entry.payload.vorherigerStand, before);
      return require("../lib/helmut/storage").ergaenzeUnvollstaendigesBriefing(before, entry, {
        bereit: true, request: async (url, opts) => {
          A.equal(opts.method, "PATCH"); A(url.includes(`user_id=eq.${encodeURIComponent(profile.id)}`));
          A(url.includes(`payload->>inhaltHash=eq.${before.payload.inhaltHash}`));
          A(url.includes(`generated_at=eq.${encodeURIComponent(before.generated_at)}`));
          const patch = JSON.parse(opts.body); A.deepEqual(patch.payload, entry.payload);
          rows.set(entry.id, structuredClone(entry)); updates++; return [structuredClone(entry)];
        }
      });
    } };
  const ko = { id: "ko-test", vorgang_id: "vg-test", understanding_status: "complete", status: "neu",
    headline: "Pflegebericht veröffentlicht", was_ist_passiert: "Der Bericht beschreibt die Pflegeversorgung.",
    created_at: "2026-11-06T06:00:00Z", updated_at: "2026-11-06T06:00:00Z" };
  const doc = { id: "rd-test", title: ko.headline, url: "https://example.org/isoliert/pflegebericht",
    source_name: "Deklariertes Testmedium", published_at: "2026-11-06T03:57:13Z",
    summary: "Der Bericht beschreibt die regionale Pflegeversorgung und den bestehenden Beratungsbedarf der beteiligten Einrichtungen. Er nennt keinen bevorstehenden Verfahrensschritt." };
  const make = versorgung => C.toBriefingContractV3({ profile, decisions: [{ knowledge_object_id: ko.id,
    vorgang_id: ko.vorgang_id, decision: "Ignorieren", priority_type: "normal", score: 10, matched_features: [] }],
    kosById: { [ko.id]: ko }, sourcesByVorgang: { [ko.vorgang_id]: [doc] }, now, versorgung });
  await test("Echtes Quiet wird per bestehendem Partial-CAS durch gespeichertes Gap ersetzt", async () => {
    const quiet = make(null); A.equal(quiet.currentHelmutState.emptyState.kind, "quiet");
    await B.materialisiere({ profile, userId: profile.id, briefing: quiet, storage, now });
    const gap = make(signal("offen"));
    const result = await M.speicherePaket({ profile, userId: profile.id, briefing: gap, storage, now, tag });
    A.equal(updates, 1); A.equal(result.beleg.vollstaendig, false);
    A.equal(result.briefing.currentHelmutState.emptyState.kind, "gap");
    A.deepEqual(result.briefing.currentHelmutState.versorgung, signal("offen"));
    const view = require("./lib/briefing-ansichten")(result.briefing, now.toISOString());
    A(!view.html.briefing.includes("hstand-state-card--quiet"));
  });
  await test("Historisch vollstaendiges Quiet bekommt kein breiteres Schreibrecht", async () => {
    const id = `bf-${profile.id}-mandatsbriefing-${tag}`, row = structuredClone(rows.get(id));
    row.payload.briefing = make(null); row.payload.inhaltHash = B.hash({ briefing: row.payload.briefing, lage: row.payload.lage });
    row.payload.pruefung.strukturellVollstaendig = true; rows.set(id, row);
    const before = structuredClone(row);
    await A.rejects(B.materialisiere({ profile, userId: profile.id, briefing: make(signal("unbekannt")), storage, now }),
      /briefing-versorgung-stand-unbestaetigt/);
    A.deepEqual(rows.get(id), before); A.equal(updates, 1);
  });
  await test("Historisches positives Komplettpaket bleibt erhalten ohne heutige Vollbestaetigung", async () => {
    const id = `bf-${profile.id}-mandatsbriefing-${tag}`, row = structuredClone(rows.get(id));
    const positive = C.toBriefingContractV3({ profile, decisions: [{ knowledge_object_id: ko.id,
      vorgang_id: ko.vorgang_id, decision: "Reagieren", priority_type: "risk", score: 90, matched_features: [] }],
      kosById: { [ko.id]: ko }, sourcesByVorgang: { [ko.vorgang_id]: [{ ...doc, published_at: "2026-11-09T03:00:00Z" }] }, now });
    A(positive.currentHelmutState.primaryItem); row.payload.briefing = positive;
    row.payload.inhaltHash = B.hash({ briefing: positive, lage: row.payload.lage }); rows.set(id, row);
    const before = structuredClone(row);
    const result = await M.speicherePaket({ profile, userId: profile.id,
      briefing: { ...positive, currentHelmutState: { ...positive.currentHelmutState, versorgung: signal("offen") } }, storage, now, tag });
    A.deepEqual(rows.get(id), before); A.deepEqual(result.briefing, positive);
    A.equal(result.beleg.vollstaendig, false); A.equal(updates, 1);
  });
  await test("Echter Server-Leerpfad liest heutigen Versorgungsstand und zeigt keine Ruhe", async () => {
    const S = require("../lib/helmut/storage"); S.v3StoreReady = () => true; S.listKnowledgeObjects = async () => [];
    const original = V.lese; let args;
    V.lese = async x => { args = x; return signal("unbekannt"); };
    try {
      const result = await require("../server").__buildV3Briefing(profile, profile.id, { now });
      A.equal(args.mandat, profile.id); A.equal(args.jetztMs, now.getTime());
      A.equal(result.currentHelmutState.emptyState.kind, "gap");
      A.deepEqual(result.currentHelmutState.versorgung, signal("unbekannt"));
    } finally { V.lese = original; }
  });
  await test("Neues positives Teilpaket wird nach Restabschluss mit neuen Fakten per Partial-CAS ergaenzt", async () => {
    const Q = require("../lib/helmut/lage-textqualitaet"), L = require("../lib/helmut/lage-quellenbeleg");
    const render = require("./lib/briefing-ansichten");
    function paket(fassung, zustand) {
      const documents = [0, 1].map(i => ({ ...doc, id: `rd-positive-${i}`,
        title: `${fassung}: Pflegeberatung zum Vorhaben ${i}`,
        url: `https://example.org/isoliert/positive-pflege-${i}`, published_at: "2026-11-09T03:00:00Z",
        summary: `Die öffentliche Beratung zur Pflegeversorgung im Vorhaben ${i} findet am 2026-11-10 mit den beteiligten Verbänden im Parlament statt.` }));
      const kos = documents.map((d, i) => ({ ...ko, id: `ko-positive-${i}`, vorgang_id: `vg-positive-${i}`,
        headline: d.title, was_ist_passiert: d.summary }));
      const sources = Object.fromEntries(kos.map((k, i) => [k.vorgang_id, [documents[i]]]));
      const briefing = C.toBriefingContractV3({ profile, decisions: kos.map(k => ({ knowledge_object_id: k.id,
        vorgang_id: k.vorgang_id, decision: "Reagieren", priority_type: "risk", score: 90, matched_features: [] })),
        kosById: Object.fromEntries(kos.map(k => [k.id, k])), sourcesByVorgang: sources, now, versorgung: signal(zustand) });
      const entries = kos.map((k, i) => ({ vorgang_id: k.vorgang_id, quellenbelege: [{
        quelle_id: `q-positive-${i}`, titel: documents[i].title, auszug: documents[i].summary, url: documents[i].url }] }));
      const bezug = Q.mandatsbezugAuswahl(profile).find(b => b.wert === "Pflege");
      const paragraphs = entries.map(e => ({ text: e.quellenbelege[0].titel + ".", vorgang_ids: [e.vorgang_id],
        quelle_id: e.quellenbelege[0].quelle_id, mandatsbezug: bezug }));
      const checked = Q.pruefe(paragraphs, entries, { pruefungen: paragraphs.map((p, i) => ({ absatz: i,
        quelle_id: p.quelle_id, belegfeld: "titel", vollstaendig_belegt: true, themenrein: true, profilbezug: true,
        textart: "konkreter_sachverhalt", pruefbegruendung: "Deklariertes synthetisches Urteil fuer die isolierte Vertragspruefung.",
        mandatsbegruendung: "Das synthetische Profil nennt Pflege als Fachthema." })),
        vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
          pruefbegruendung: "Die synthetischen Quellen benennen zwei unterschiedliche Pflegevorhaben." }] }, profile);
      A.equal(checked.ok, true, JSON.stringify(checked));
      const lage = { koSetHash: "a".repeat(32), quellenVersion: L.VERSION, quellenHash: L.hashEingabe(entries),
        quellen: entries, paragraphs: checked.paragraphs, qualitaet: checked.qualitaet };
      A.equal(L.gespeicherterTextGueltig(lage), true);
      return { briefing, lage };
    }
    for (const zustand of ["offen", "unbekannt"]) {
      rows.clear(); const vorherUpdates = updates;
      const erstes = paket("Erster Stand", zustand), lageId = `bf-${profile.id}-lage-${tag}`;
      rows.set(lageId, { id: lageId, user_id: profile.id, slot: "lage", payload: erstes.lage });
      const first = await B.materialisiere({ profile, userId: profile.id, briefing: erstes.briefing, storage, now });
      A.equal(first.vollstaendig, false); A.equal(erstes.briefing.available, true);
      const before = await B.lese({ userId: profile.id, day: tag, profile, storage });
      A.deepEqual(before.payload.pruefung.fehler, ["quellenversorgung-unvollstaendig"]);
      A.equal(render(before.payload.briefing, now.toISOString()).fachinhalt.briefing, true, JSON.stringify(before.payload.briefing.currentHelmutState));
      const neu = paket("Aktualisierte Pflegereform", "kein-bekannter-rueckstand");
      rows.set(lageId, { id: lageId, user_id: profile.id, slot: "lage", payload: neu.lage });
      const result = await M.speicherePaket({ profile, userId: profile.id, briefing: neu.briefing, storage,
        now: new Date(now.getTime() + 60000), tag });
      const after = await B.lese({ userId: profile.id, day: tag, profile, storage });
      A.equal(updates, vorherUpdates + 1); A.deepEqual(after.payload.vorherigerStand, before);
      A.equal(after.payload.pruefung.strukturellVollstaendig, true); A.equal(result.beleg.vollstaendig, true);
      A.equal(after.payload.pruefung.bestanden, false); A.equal(after.payload.pruefung.vollstaendigeFaktenpruefung, false);
      A.deepEqual(after.payload.briefing.currentHelmutState.versorgung, signal("kein-bekannter-rueckstand"));
      A(render(after.payload.briefing, now.toISOString()).html.briefing.includes("Aktualisierte Pflegereform"));
    }
  });
  console.log(`PASS ${pass}/${pass} Versorgung, bestehender CAS und Anzeige; keine Fremdzaehler im Ergebnis`);
})().catch(e => { console.error(e); process.exitCode = 1; });
