"use strict";

// Gezielte Regression des neuen Kerns: drei bestehende synthetische Artikel,
// injizierter Speicher/Understanding. Kein Kapazitaetslauf, Netz oder Modell.
const assert = require("node:assert/strict");
const P = require("../lib/helmut/scalable-pipeline");
const W = require("../lib/helmut/worker-betrieb");
const Q = require("../lib/helmut/queue-verbraucher");
const D = require("../lib/helmut/dedup");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
const now = Date.parse("2026-11-13T04:00:00Z");
const env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_VERSTEHEN_CAS: "on" };
const docs = ["arbeit", "soziales", "umwelt"].map(thema => D.toRawDocumentRow({
  title: `Synthetischer Ausschussbericht ${thema}`, url: `https://example.invalid/${thema}`,
  sourceName: "Synthetische amtliche Quelle", sourceType: "official", publishedAt: "2026-11-13T02:00:00Z"
}));
const hashes = Object.fromEntries(docs.map((d, i) => [d.id, String(i + 1).repeat(64)]));
const klassenslots = () => ({ aktiv: true, belege: async () => ({ erlaubt: true, slot: "slot" }), gebeFrei: async () => {} });
const job = (ids = docs.map(d => d.id), extra = {}) => ({ id: "elternjob", jobType: "document_understanding",
  freshnessWindow: "2026-11-12T00Z", maxAttempts: 3, createdAt: new Date(now).toISOString(),
  payload: { dokumentIds: ids, quellenstaende: Object.fromEntries(ids.map(id => [id, hashes[id]])) }, ...extra });
const deps = (extra = {}) => ({ env, now: () => now, klassen: klassenslots(),
  ladeRohdokumente: async ids => docs.filter(d => ids.includes(d.id)),
  ladeRohdokumentStaende: async ids => docs.filter(d => ids.includes(d.id)),
  verstehenKonkurrenz: () => false, eagerUnderstanding: async () => ({ processed: 1, counts: { saved: 1 }, results: [{ status: "saved" }] }),
  ...extra });
let tests = 0;
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7).split(",");
async function test(name, fn) {
  if (only && !only.some(part => part && name.includes(part))) return;
  await fn(); tests++; console.log("PASS " + name);
}

(async () => {
  let singletonJobs;
  await test("Quellenabruf reiht je Artikelversion einen globalen Einzelauftrag ein", async () => {
    const jobs = [];
    const r = await P.HANDLER.source_fetch({ id: "quelle", freshnessWindow: "2026-11-13T00Z", payload: { quelle: { id: "synthetisch" } } }, deps({
      hardeningConfig: () => ({ enabled: false }), crawlAllSources: async () => ({ rawItems: docs, results: [{ ok: true }] }),
      persistRohdokumente: async () => ({ ok: true, neuIds: docs.map(d => d.id), bestaetigteIds: docs.map(d => d.id), quellenstaende: hashes }),
      enqueue: async j => { jobs.push(j); return { verfuegbar: true, id: "kind", neu: true }; }
    }));
    assert.equal(r.verstehensAuftraege, 3); assert.equal(jobs.length, 3);
    for (const j of jobs) { assert.equal(j.payload.dokumentIds.length, 1); assert.equal(j.tenantId, null);
      assert.equal(j.payload.quellenstaende[j.payload.dokumentIds[0]], hashes[j.payload.dokumentIds[0]]); }
    singletonJobs = jobs;
  });
  await test("Teilpersistenz trennt ersten defekten Artikel von bestaetigten Nachbarn und spaeterer Erholung", async () => {
    const q = erzeugeSpeicherWarteschlange({ now: () => now }); let calls = 0, broken = true;
    const source = { id: "quelle-teilweise", freshnessWindow: "2026-11-13T00Z", payload: { quelle: { id: "synthetisch" } } };
    const d = deps({ hardeningConfig: () => ({ enabled: false }),
      crawlAllSources: async () => ({ rawItems: docs, results: [{ ok: true }] }), enqueue: q.enqueue,
      persistRohdokumente: async () => {
        const good = broken ? docs.slice(1) : docs;
        return { ok: !broken, neuIds: docs.map(d => d.id), bestaetigteIds: good.map(d => d.id),
          quellenstaende: Object.fromEntries(good.map(d => [d.id, hashes[d.id]])),
          quellenversionen: good.map(d => ({ id: d.id, stand: hashes[d.id] })),
          artikelFehler: broken ? [{ id: docs[0].id, stand: hashes[docs[0].id], grund: "quellenstand-nicht-bestaetigt" }] : [] };
      } });
    const r = await P.HANDLER.source_fetch(source, d); assert.equal(r.ok, true); assert.equal(r.teilfehler, 1);
    const rows = q.alle(), diagnostic = rows.find(j => j.payload.artikelFehler);
    assert.equal(rows.length, 3); assert.equal(rows.filter(j => !j.payload.artikelFehler).length, 2);
    await assert.rejects(P.HANDLER.document_understanding({ ...diagnostic, payload: diagnostic.payload }, deps({
      ladeRohdokumente: async () => { calls++; }, ladeRohdokumentStaende: async () => { calls++; },
      eagerUnderstanding: async () => { calls++; }
    })), /artikel-eingangsfehler/); assert.equal(calls, 0);
    broken = false; const recovered = await P.HANDLER.source_fetch(source, d); assert.equal(recovered.ok, true);
    assert.equal(q.alle().length, 4, "Bestaetigte Version bekommt ihren kanonischen Job trotz erhaltenem Eingangsfehlerbeleg");
    assert.equal(q.alle().filter(j => j.payload.dokumentIds[0] === docs[0].id && !j.payload.artikelFehler).length, 1);
  });
  await test("Teilpersistenz verliert bei einzelner unklarer Einreihung keine weiteren Kinder", async () => {
    const tried = [];
    await assert.rejects(P.HANDLER.source_fetch({ id: "quelle", freshnessWindow: "2026-11-13T00Z", payload: { quelle: { id: "synthetisch" } } }, deps({
      hardeningConfig: () => ({ enabled: false }), crawlAllSources: async () => ({ rawItems: docs, results: [{ ok: true }] }),
      persistRohdokumente: async () => ({ ok: true, neuIds: docs.map(d => d.id), bestaetigteIds: docs.map(d => d.id), quellenstaende: hashes }),
      enqueue: async j => { tried.push(j); if (tried.length === 1) throw Error("Unklarer Schreibausgang");
        return { verfuegbar: true, id: "kind", neu: true }; }
    })), /verstehen-nicht-eingereiht/);
    assert.equal(tried.length, 3);
  });
  await test("Legacyaufteilung benutzt dieselben Schluessel und bleibt bei Neustart idempotent", async () => {
    const q = erzeugeSpeicherWarteschlange({ now: () => now }); let paid = 0;
    const d = deps({ enqueue: q.enqueue, eagerUnderstanding: async () => { paid++; throw Error("kein Modell bei Aufteilung"); } });
    assert.equal((await P.HANDLER.document_understanding(job(), d)).artikelauftraege, 3);
    assert.equal((await P.HANDLER.document_understanding(job(), d)).ok, true);
    assert.equal(q.alle().length, 3); assert.equal(paid, 0);
    assert.deepEqual(q.alle().map(j => j.idempotency_key).sort(), singletonJobs.map(j => j.idempotencyKey).sort());
    assert.ok(q.alle().every(j => j.freshness_window === "2026-11-12T00Z"));
  });
  await test("Ein fehlender Legacyartikel verhindert bestaetigte brauchbare Kinder nicht", async () => {
    const enqueued = [], unversioniert = job(); delete unversioniert.payload.quellenstaende;
    await assert.rejects(P.HANDLER.document_understanding(unversioniert, deps({
      bindeRohdokumentStaende: async ids => { if (ids[0] === docs[1].id) throw Error("fehlt"); return { [ids[0]]: hashes[ids[0]] }; },
      enqueue: async j => { enqueued.push(j); return { verfuegbar: true, id: "kind", neu: true }; }
    })), /artikelaufteilung-nicht-bestaetigt: 1/);
    assert.deepEqual(enqueued.map(j => j.payload.dokumentIds[0]).sort(), [docs[0].id, docs[2].id].sort());
  });
  await test("Unklare Einreihung schliesst Elternjob nicht ab; andere Kinder bleiben bestaetigt", async () => {
    const children = []; await assert.rejects(P.HANDLER.document_understanding(job(), deps({ enqueue: async j => {
      if (j.payload.dokumentIds[0] === docs[1].id) return { verfuegbar: true };
      children.push(j); return { verfuegbar: true, id: "kind", neu: true };
    } })), /artikelaufteilung-nicht-bestaetigt/); assert.equal(children.length, 2);
  });
  await test("Bestaetigter Rest und Abschnittsfortschritt ueberleben Legacyaufteilung", async () => {
    const j = job(); j.payload.quellenRestDokumentIds = [docs[2].id]; j.payload.quellenAbschnitte = { [docs[2].id]: 2 };
    const children = []; await P.HANDLER.document_understanding(j, deps({ enqueue: async child => {
      children.push(child); return { verfuegbar: true, id: "kind", neu: true };
    } })); assert.equal(children.length, 1); assert.deepEqual(children[0].payload.quellenAbschnitte, { [docs[2].id]: 2 });
  });
  await test("Einzelartikel ohne CAS startet kein Modell", async () => {
    let calls = 0; const r = await P.HANDLER.document_understanding(job([docs[0].id]), deps({ env: { HELMUT_SCALABLE_PIPELINE: "on" },
      eagerUnderstanding: async () => { calls++; } })); assert.equal(r.grund, "verstehen-cas-erforderlich"); assert.equal(calls, 0);
  });
  await test("Inlineartikel und fehlende gespeicherte Version werden nicht als bestaetigt verarbeitet", async () => {
    const j = job([docs[0].id]); j.payload.dokumente = [docs[0]];
    await assert.rejects(P.HANDLER.document_understanding(j, deps()), /artikelinhalt-statt-speicherbindung/);
    await assert.rejects(P.HANDLER.document_understanding(job([docs[0].id]), deps({ ladeRohdokumentStaende: async () => [] })), /artikelversion-nicht-verfuegbar/);
  });
  await test("Besuchte Artikel ohne bestaetigten Ergebnistyp gelten nicht als Erfolg", async () => {
    await assert.rejects(P.HANDLER.document_understanding(job([docs[0].id]), deps({ eagerUnderstanding: async () => ({ processed: 1 }) })), /bestaetigter-ausgang-fehlt/);
  });
  await test("Unbekannter bezahlter Ausgang wird niemals als Artikel-Erfolg gemeldet", async () => {
    await assert.rejects(P.HANDLER.document_understanding(job([docs[0].id]), deps({
      eagerUnderstanding: async () => ({ processed: 1, results: [{ status: "skipped-ausgang-unbekannt" }] })
    })), /modellausgang-unbekannt/);
  });
  await test("Artikelvalidierungsfehler und Leseluecke besitzen ehrliche getrennte Ausgaenge", async () => {
    await assert.rejects(P.HANDLER.document_understanding(job([docs[0].id]), deps({
      eagerUnderstanding: async () => ({ processed: 1, counts: { "skipped-invalid": 1 } })
    })), /artikel-pruefung-fehlgeschlagen/);
    const r = await P.HANDLER.document_understanding(job([docs[1].id]), deps({
      eagerUnderstanding: async () => ({ processed: 1, counts: { "skipped-store": 1 } })
    })); assert.equal(r.zurueckgestellt, true); assert.equal(r.ok, false);
    assert.equal((await P.HANDLER.document_understanding(job([docs[2].id]), deps())).ok, true);
  });
  await test("Fehlende verteilte Grenze verhindert Claim und direkten Queueverbrauch", async () => {
    let claims = 0; const r = await P.arbeite({ env, deps: { claim: async () => { claims++; } } });
    assert.equal(r.grund, "verteilte-klassengrenzen-erforderlich"); assert.equal(claims, 0);
    const q = await Q.verarbeiteWecksignal({ env, payload: { jobId: "12345678-1234-1234-1234-123456789abc", schemaVersion: 1 },
      deps: { waehleAntrieb: () => ({ antrieb: "ereignis" }), claimById: async () => { claims++; } } });
    assert.equal(q.grund, "verteilte-klassengrenzen-erforderlich"); assert.equal(claims, 0);
    assert.equal((await W.readiness({ env, deps: { metrics: async () => ({ verfuegbar: false }) } })).bereit, false);
  });
  await test("Mandatsprojektion nutzt gespeicherte Fakten trotz offener Einzelartikel", async () => {
    let projected = 0; const r = await P.HANDLER.mandate_projection({ ...job(), tenantId: "synthetik", payload: { mandatsId: "synthetik" } }, deps({
      offeneVorbedingungen: async () => { throw Error("globale Artikelsperre darf nicht aufgerufen werden"); },
      getActiveProfile: async () => ({ id: "synthetik" }), matching: async () => { projected++; return { matched: 2 }; }, decisions: async () => ({ saved: 1 })
    })); assert.equal(r.ok, true); assert.equal(projected, 1);
  });
  await test("Materialisierung wartet nur auf eigene Vorgaenger und erhaelt bestaetigte Teil-Lage", async () => {
    const j = { ...job(), tenantId: "synthetik", payload: { mandatsId: "synthetik" } };
    const view = { available: true, vorgaenge: [{ vorgangId: "vg-bestaetigt" }] };
    let offen = 1, writes = 0; const d = deps({ env: { ...env, HELMUT_NARRATIV_QUEUE: "on" },
      offeneVorbedingungen: async arg => { assert.equal(arg.mandat, "synthetik");
        assert.deepEqual(arg.typen, ["mandate_projection", "tenant_narrative"]);
        return { verfuegbar: true, offen, fehlgeschlagen: 1 }; },
      getActiveProfile: async () => ({ id: "synthetik" }), buildV3Briefing: async () => ({ available: true }),
      lageNarrativ: async (p, o) => { assert.equal(o.cacheOnly, true); return view; },
      materialisiereBriefing: async arg => { writes++; assert.deepEqual(arg.lageAnsicht, view); return { ok: true, gespeichert: true }; }
    });
    assert.equal((await P.HANDLER.briefing_materialization(j, d)).zurueckgestellt, true); assert.equal(writes, 0);
    offen = 0; assert.equal((await P.HANDLER.briefing_materialization(j, d)).ok, true); assert.equal(writes, 1);
    assert.equal((await P.HANDLER.briefing_materialization(j, { ...d, offeneVorbedingungen: async () => ({ verfuegbar: false }) })).grund,
      "mandatsvorbedingung-nicht-pruefbar"); assert.equal(writes, 1);
  });
  await test("Narrativ wartet auf eigene Projektion und benennt unklaren Ausgang ohne Freigabe", async () => {
    const j = { ...job(), tenantId: "synthetik", payload: { mandatsId: "synthetik" } };
    let offen = 1, calls = 0; const d = deps({ env: { ...env, HELMUT_NARRATIV_QUEUE: "on" },
      offeneVorbedingungen: async arg => { assert.deepEqual(arg.typen, ["mandate_projection"]); return { verfuegbar: true, offen }; },
      getActiveProfile: async () => ({ id: "synthetik" }), istDeaktiviert: () => false,
      lageNarrativ: async () => { calls++; return { available: false, reason: "verarbeitung-ausgang-unklar" }; }
    });
    assert.equal((await P.HANDLER.tenant_narrative(j, d)).zurueckgestellt, true); assert.equal(calls, 0);
    offen = 0; const r = await P.HANDLER.tenant_narrative(j, d);
    assert.equal(r.grund, "narrativ-ausgang-unklar"); assert.equal(r.langeWarten, true); assert.equal(calls, 1);
  });
  await test("Morgenplan haelt moderne Projektion vor05UTC bei unveraenderter Tagesidentitaet", async () => {
    const SD = require("../lib/helmut/source-demand"), zeit = Date.parse("2026-11-13T03:00:00Z"), tag = Date.parse("2026-11-13T00:00:00Z");
    const profile = [{ id: "synthetik-morgen-a" }, { id: "synthetik-morgen-b" }];
    const legacy = SD.planeMandatsarbeit({ profile, jetztMs: zeit, env: {}, narrativAktiv: true });
    const modern = SD.planeMandatsarbeit({ profile, jetztMs: zeit, env: {}, narrativAktiv: true, morgenarbeit: true });
    assert.ok(legacy.auftraege.filter(j => j.jobType === "mandate_projection").every(j => Date.parse(j.dueAt) >= tag + 12 * 3600000));
    assert.ok(modern.auftraege.filter(j => j.jobType === "mandate_projection").every(j => Date.parse(j.dueAt) < tag + 4 * 3600000));
    assert.ok(modern.auftraege.every(j => Date.parse(j.dueAt) < tag + 5 * 3600000));
    assert.deepEqual(modern.auftraege.map(j => j.idempotencyKey), legacy.auftraege.map(j => j.idempotencyKey));
    const bounded = { ...env, HELMUT_QUELLEN_ARBEITSFENSTER: "on" };
    const before = SD.planeMandatsarbeit({ profile, jetztMs: zeit, env: bounded, narrativAktiv: true });
    const after = SD.planeMandatsarbeit({ profile, jetztMs: zeit, env: bounded, narrativAktiv: true, morgenarbeit: true });
    assert.deepEqual(after, before, "Bereits passender begrenzter Morgenplan bleibt unveraendert");
  });
  await test("Vorgaengerfrist macht unbekannte oder offene moderne Vorgaenger niemals vollstaendig", async () => {
    const j = { ...job(), tenantId: "synthetik", createdAt: new Date(now - 7 * 3600000).toISOString(), payload: { mandatsId: "synthetik" } };
    let stand = { verfuegbar: false }, writes = 0;
    const d = deps({ offeneVorbedingungen: async () => stand, getActiveProfile: async () => ({ id: "synthetik" }),
      buildV3Briefing: async () => ({ available: false }), lageNarrativ: async () => ({ available: false }),
      materialisiereBriefing: async () => { writes++; return { ok: true, gespeichert: true }; } });
    assert.equal((await P.HANDLER.briefing_materialization(j, d)).grund, "mandatsvorbedingung-nicht-pruefbar");
    stand = { verfuegbar: true, offen: 1 }; assert.equal((await P.HANDLER.briefing_materialization(j, d)).zurueckgestellt, true);
    assert.equal(writes, 0);
    const old = { ...j, createdAt: new Date(now - 49 * 3600000).toISOString() };
    await assert.rejects(P.HANDLER.briefing_materialization(old, d), /mandatsvorbedingung-dauerhaft-offen/);
    stand = { verfuegbar: false }; await assert.rejects(P.HANDLER.briefing_materialization(old, d), /mandatsvorbedingung-dauerhaft-nicht-pruefbar/);
    stand = { verfuegbar: true, offen: 0, fehlgeschlagen: 1 };
    assert.equal((await P.HANDLER.briefing_materialization(old, d)).ok, true); assert.equal(writes, 1);
  });
  await test("Ein Artikel scheitert sichtbar, zwei andere werden durch denselben Worker bestaetigt", async () => {
    const q = erzeugeSpeicherWarteschlange({ now: () => now });
    for (const j of singletonJobs) await q.enqueue({ ...j, maxAttempts: 1 });
    const r = await P.arbeite({ env, stapel: 1, deps: deps({ claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      eagerUnderstanding: async rows => rows[0].id === docs[1].id
        ? { processed: 1, counts: { "skipped-invalid": 1 } } : { processed: 1, counts: { saved: 1 } }
    }) });
    assert.equal(r.erledigt, 2); assert.equal(r.endgueltigFehlgeschlagen, 1);
    assert.equal(q.alle().find(j => j.payload.dokumentIds[0] === docs[1].id).status, "fehlgeschlagen");
    assert.equal(q.alle().filter(j => j.status === "erledigt").length, 2);
  });
  await test("Fremde Mandatskennung stoppt alle drei Mandatshandler vor dem ersten Lesen", async () => {
    const d = deps({ env: { ...env, HELMUT_NARRATIV_QUEUE: "on" }, getActiveProfile: async () => { throw Error("unerlaubter Zugriff"); } });
    for (const typ of ["mandate_projection", "briefing_materialization", "tenant_narrative"])
      await assert.rejects(P.HANDLER[typ]({ tenantId: "mandat-a", payload: { mandatsId: "mandat-b" } }, d), /mandatsbindung-abweichend/);
  });
  await test("Mandatsarbeit ist systemweit auf zwei geklemmt und Slotfreigabe folgt realem Abschluss", async () => {
    assert.equal(P.klassenMax("mandatsarbeit", { HELMUT_KLASSE_MANDATSARBEIT_MAX: "999" }), 2);
    let finish, done; const running = new Promise(resolve => { done = resolve; }); const seen = [];
    const d = P.workerDeps(deps({ handler: { mandate_projection: async () => { await running; return { ok: true }; } },
      klassen: { belege: async (type, o) => { seen.push([type, o.ttlMs]); return { erlaubt: true, slot: "s" }; },
        gebeFrei: async () => seen.push("frei") }, finish: async () => ({ verfuegbar: true, uebernommen: true }) }));
    const promise = P.fuehreAuftragAus({ auftrag: { id: "j", job_type: "mandate_projection", payload: {} }, deps: d, besitzer: "w", restzeitMs: 1000 });
    await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(seen, [["mandatsarbeit", 360000]]);
    done(); finish = await promise; assert.equal(finish.ausgang, "erledigt"); assert.equal(seen[1], "frei");
  });
  await test("Klassenadapter reicht Erneuerung mit demselben Besitzer durch", async () => {
    let seen; const a = P.klassenAdapter({ env: { HELMUT_KLASSEN_GRENZEN: "on" }, owner: "owner",
      deps: { klasseErneuere: async o => { seen = o; return { verfuegbar: true, erneuert: true }; } } });
    assert.equal((await a.erneuere("slot", { ttlMs: 360000 })).erneuert, true);
    assert.deepEqual(seen, { slot: "slot", owner: "owner", ttlMs: 360000 });
  });
  console.log(`${tests}/${tests} gezielte Pruefungen bestanden`);
})().catch(error => { console.error(error); process.exitCode = 1; });
