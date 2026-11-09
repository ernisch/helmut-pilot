"use strict";

// Kleine isolierte Fortsetzung: vorhandene Originalfixtures, keine Netz-/Modellaufrufe.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
process.env.HELMUT_VORBEDINGUNG_WARTE_MS = "10000";
const P = require("../lib/helmut/scalable-pipeline"), D = require("../lib/helmut/dedup");
const C = require("../lib/helmut/crawler");
const G = require("../lib/helmut/artikelkontext-gewinnung");
const start = Date.parse("2026-11-09T04:00:00Z");
const profile = { id: "queue-offline", name: "Synthetischer Queue Test", party: "SPD", parliament: "Bundestag",
  state: "Niedersachsen", focusTopics: ["Arbeit", "Soziales"], profileActive: true };
const contract = { version: 1, profileId: profile.id, startsAt: "2026-11-05T00:00:00.000Z", dailyLimitUsd: 1, totalLimitUsd: 30,
  route: { provider: "azure", responsesUrl: "https://offline.openai.azure.com/openai/v1/responses", model: "gpt-5-mini" } };
const env = { HELMUT_ARTIKELKONTEXT: "on", HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.dgb.de,www.radio-hannover.de",
  HELMUT_UNDERSTANDING_JOB_BUDGET_MS: "120000", HELMUT_BETRIEBSKOSTENVERTRAG_JSON: JSON.stringify(contract) };
const feed = C.parseRssItems(fs.readFileSync(path.join(__dirname, "fixtures/quelleninhalt-20261107/dgb-google.xml"), "utf8"))[0];
const docs = [
  { ...D.toRawDocumentRow(C.normalizeRawItem({ ...feed, originalUrl: feed.url,
    url: "https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/" },
  { id: "dgb", name: "DGB", type: "association", url: "https://news.google.com/rss/search?q=site:dgb.de" })), source_name: "DGB" },
  D.toRawDocumentRow({ title: "Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover", sourceName: "Radio Hannover", sourceType: "media",
    url: "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen", publishedAt: "2026-11-06T11:11:24Z" })
];
const job = { id: "queue-offline-job", idempotencyKey: "queue-offline-key", createdAt: new Date(start).toISOString(),
  payload: { dokumentIds: docs.map(d => d.id) } };
const understanding = P.HANDLER.document_understanding;
function deps(extra = {}) { return { env, now: () => start, listFullProfiles: async () => [profile],
  ladeRohdokumente: async () => docs, verstehenKonkurrenz: () => false,
  ...extra }; }
const result = (documents, offen = false) => ({ dokumente: documents, fortsetzungOffen: offen,
  artikelkontextVersorgung: Object.assign(async () => ({ angefordert: false }), { nurBestand: true }) });
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Bereits geladene Eingabe ausserhalb Kandidatenauswahl bleibt dauerhaft eingereiht", async () => {
    const jobs = [], erhalten = [];
    const r = await P.HANDLER.source_fetch({ id: "cap-offline", payload: { quelle: { id: "quelle" } } }, {
      hardeningConfig: () => ({ enabled: false }),
      crawlAllSources: async () => ({ rawItems: docs.slice(0, 1), results: [{ ok: true, items: docs }] }),
      persistRohdokumente: async rows => { erhalten.push(...rows); return { ok: true, neuIds: rows.map(d => d.id), bestaetigteIds: rows.map(d => d.id) }; },
      enqueue: async j => { jobs.push(j); return { verfuegbar: true, neu: true }; }
    });
    assert.equal(r.rohitems, 2); assert.equal(r.sofortKandidaten, 1);
    assert.deepEqual(erhalten, docs); assert.deepEqual(jobs[0].payload.dokumentIds, docs.map(d => d.id).sort());
  });
  await test("Persistiert, Enqueuefehler, Wiederholung: vorhandene IDs erneut einreihen ohne Neuzaehler", async () => {
    let persisted = false, fail = true; const seen = [];
    const d = { hardeningConfig: () => ({ enabled: false }), crawlAllSources: async () => ({ rawItems: docs, results: [{ ok: true }] }),
      persistRohdokumente: async () => { const neuIds = persisted ? [] : docs.map(d => d.id); persisted = true;
        return { ok: true, neuIds, bestaetigteIds: docs.map(d => d.id), vorhandene: docs.length - neuIds.length }; },
      enqueue: async input => { seen.push(input); return { verfuegbar: !fail, neu: !fail }; } };
    const sourceJob = { id: "source-offline", payload: { quelle: { id: "fixture-source" } } };
    await assert.rejects(P.HANDLER.source_fetch(sourceJob, d), /verstehen-nicht-eingereiht/);
    fail = false; const r = await P.HANDLER.source_fetch(sourceJob, d);
    assert.equal(r.neueRohdokumente, 0); assert.equal(r.gespeichert, 0); assert.equal(r.bereitsVorhanden, 2);
    assert.equal(r.verstehensAuftraege, 1); assert.deepEqual(seen[0], seen[1]); assert.equal(seen[1].tenantId, null);
  });
  await test("Teilvorbereitung bleibt offen; zweiter Slot nutzt Fixturebeleg und verarbeitet nur Rest", async () => {
    let clock = start, phase = 0, reservations = 0; const receipts = new Map(), understood = new Set(), budgets = [];
    const d = deps({ now: () => clock,
      budget: { reserviere: async arg => { assert.equal(arg.mandatsId, null); reservations++; return { erlaubt: true }; }, melde: async () => {} },
      vorbereiteGespeicherteInhalte: async input => {
        assert.deepEqual(input.profile, [profile]); assert.equal(input.deadlineMs, clock + 120000);
        const index = phase++, doc = docs[index];
        const body = fs.readFileSync(path.join(__dirname, "fixtures/inhaltsversorgung-20261108", index ? "radio-hannover.html" : "dgb-artikel.html"), "utf8");
        const r = G.gewinneArtikelEinstieg(doc, { body, finalUrl: doc.url, gelesenAm: new Date(clock).toISOString() });
        assert.equal(r.ok, true, r.reason); receipts.set(doc.id, r.beleg);
        clock += 15000;
        return { dokumente: docs, fortsetzungOffen: index === 0,
          befund: docs.map(d => ({ id: d.id, status: receipts.has(d.id) ? "belegt" : "luecke" })),
          artikelkontextVersorgung: Object.assign(async selected => ({ angefordert: true, ok: receipts.has(selected[0].id),
            beleg: receipts.get(selected[0].id) }), { nurBestand: true }) };
      },
      eagerUnderstanding: async (documents, opts) => {
        budgets.push(opts.budgetMs); assert.equal(opts.betriebskostenProfileId, profile.id);
        let processed = 0, deferred = 0; const results = [];
        for (const doc of documents) {
          if (understood.has(doc.id)) continue;
          const r = await opts.artikelkontextVersorgung([doc]);
          if (!r.ok) { deferred++; continue; }
          assert.ok(r.beleg.text.length > 600); understood.add(doc.id); processed++;
          results.push({ status: "saved", promptDokumentIds: [doc.id] });
        }
        return { processed, deferred, results };
      } });
    let r = await understanding(job, d, { auftragsDeadlineMs: clock + 120000 });
    assert.equal(r.zurueckgestellt, true); assert.equal(r.ok, false); assert.equal(understood.size, 1);
    assert.deepEqual(r.fortschrittPayload.quellenRestDokumentIds, [docs[1].id]);
    r = await understanding({ ...job, payload: r.fortschrittPayload }, d, { auftragsDeadlineMs: clock + 120000 });
    assert.equal(r.ok, true); assert.equal(understood.size, 2); assert.equal(receipts.size, 2);
    assert.deepEqual(budgets, [105000, 105000]); assert.equal(reservations, 2);
  });
  await test("Kostenvertrag blockiert fremde/mehrere/deaktivierte aktive Profile vor Beschaffung", async () => {
    for (const profiles of [[{ ...profile, id: "anderes-profil" }], [profile, { ...profile, id: "zweites-profil" }], [{ ...profile, profileActive: false }]]) {
      await assert.rejects(understanding(job, deps({ listFullProfiles: async () => profiles,
        vorbereiteGespeicherteInhalte: async () => { throw Error("nicht erreichen"); } }), { auftragsDeadlineMs: start + 120000 }), /profilbindung-abweichend/);
    }
  });
  await test("Keine Restzeit nach Beschaffung reserviert weder Jobbudget noch Modell", async () => {
    let clock = start;
    const r = await understanding(job, deps({ now: () => clock,
      vorbereiteGespeicherteInhalte: async () => { clock += 120001; return { ...result(docs), befund: docs.map(d => ({ id: d.id, status: "belegt" })) }; },
      budget: { reserviere: async () => { throw Error("Budget unzulaessig"); } },
      eagerUnderstanding: async () => { throw Error("Modell unzulaessig"); } }), { auftragsDeadlineMs: start + 120000 });
    assert.equal(r.zurueckgestellt, true);
  });
  await test("Teilweise verstandener Altpfad und Zeitbudgetausgang bleiben in bestehender Queue", async () => {
    for (const ergebnis of [{ processed: 1, deferred: 1 }, { processed: 1, counts: { "skipped-zeitbudget": 1 } }]) {
      const r = await understanding(job, deps({ env: {}, eagerUnderstanding: async () => ergebnis }));
      assert.equal(r.ok, false); assert.equal(r.zurueckgestellt, true);
    }
  });
  await test("Negativer Beleg bleibt offen; wiederholter Bestand startet kein Modell", async () => {
    let bestaende = 0, callbacks = 0;
    const d = deps({ vorbereiteGespeicherteInhalte: async () => { bestaende++; return {
      ...result(docs), artikelkontextVersorgung: async () => { callbacks++; return { angefordert: true, ok: false, reason: "negativer-beleg" }; }
    }; }, eagerUnderstanding: async (documents, opts) => {
      const r = await opts.artikelkontextVersorgung(documents); assert.equal(r.ok, false);
      return { processed: 1, counts: { "skipped-artikelkontext": 1 } };
    } });
    for (let i = 0; i < 2; i++) assert.equal((await understanding(job, d, { auftragsDeadlineMs: start + 120000 })).zurueckgestellt, true);
    assert.equal(bestaende, 2); assert.equal(callbacks, 0, "Kein bereiter Artikel: Understanding wird gar nicht betreten");
  });
  await test("Auch vor dem Modell vertagte Inhalte behalten vorhandene endliche Wartefrist", async () => {
    await assert.rejects(understanding({ ...job, createdAt: "2020-01-01T00:00:00Z" }, deps({
      vorbereiteGespeicherteInhalte: async () => result([]) }), { auftragsDeadlineMs: start + 120000 }), /verstehen-uebersprungen-dauerhaft/);
  });
  await test("Gefilterte Quellenluecke verschwindet nicht hinter erfolgreicher Teilmenge", async () => {
    const r = await understanding(job, deps({ vorbereiteGespeicherteInhalte: async () => ({ ...result([docs[0]]),
      befund: [{ id: docs[1].id, status: "luecke", reason: "quellensichtbarkeit-fehlt" }] }),
    eagerUnderstanding: async () => ({ processed: 1, deferred: 0 }) }), { auftragsDeadlineMs: start + 120000 });
    assert.equal(r.ok, false); assert.equal(r.zurueckgestellt, true);
  });
  await test("Ausgeschalteter Inhaltsweg behaelt Defaultbudget und benoetigt keine Profillesung", async () => {
    const r = await understanding(job, deps({ env: {}, listFullProfiles: async () => { throw Error("nicht lesen"); },
      eagerUnderstanding: async (_, opts) => { assert.equal(opts.budgetMs, 60000); assert.equal(opts.betriebskostenProfileId, undefined);
        return { processed: 2, deferred: 0 }; } }));
    assert.equal(r.ok, true);
  });
  await test("13 Dokumente: echter Worker speichert 12/1-Rest vor Defer und schliesst erst danach ab", async () => {
    const sourceDocs = Array.from({ length: 13 }, (_, i) => D.toRawDocumentRow({ title: `Isolierte Quellenmeldung Nummer ${i}`,
      sourceName: "Isolierte Redaktion", sourceType: "media", url: `https://fixture.invalid/quelle-${i}`,
      summary: "Die Beratung zur gesetzlichen Absicherung betrifft zahlreiche Beschäftigte und kommunale Einrichtungen. Ein Beschluss wird in der nächsten Sitzung erwartet." }));
    let row = { id: "queue-dreizehn", job_type: "document_understanding", created_at: new Date(start).toISOString(),
      payload: { dokumentIds: sourceDocs.map(d => d.id) }, attempts: 1, max_attempts: 3 };
    let calls = 0, deferred = 0, finished = 0, writes = 0;
    const d = deps({ handler: P.HANDLER, ladeRohdokumente: async () => sourceDocs,
      vorbereiteGespeicherteInhalte: async () => result(sourceDocs),
      eagerUnderstanding: async (documents, opts) => {
        assert.equal(documents.length, 13); calls++;
        const selected = opts.quellenRestDokumentIds.slice(0, 12);
        assert.equal(selected.length, calls === 1 ? 12 : 1);
        return { processed: 1, deferred: 0, results: [{ status: calls === 1 ? "saved" : "updated", promptDokumentIds: selected }] };
      },
      fortschritt: async args => {
        assert.equal(args.owner, "queue-test"); assert.deepEqual(args.vorher, row.payload);
        row = { ...row, payload: structuredClone(args.payload) }; writes++;
        return { verfuegbar: true, uebernommen: true };
      },
      zurueckstellen: async () => { deferred++; assert.equal(row.payload.quellenRestDokumentIds.length, 1);
        return { verfuegbar: true, uebernommen: true }; },
      finish: async args => { finished++; assert.equal(args.ok, true); assert.equal(row.payload.quellenRestDokumentIds.length, 0);
        return { verfuegbar: true, uebernommen: true }; }
    });
    assert.equal((await P.fuehreAuftragAus({ auftrag: row, deps: d, besitzer: "queue-test", leaseMs: 300000 })).ausgang, "zurueckgestellt");
    assert.equal(finished, 0);
    assert.equal((await P.fuehreAuftragAus({ auftrag: row, deps: d, besitzer: "queue-test", leaseMs: 300000 })).ausgang, "erledigt");
    assert.deepEqual([calls, writes, deferred, finished], [2, 2, 1, 1]);
  });
  await test("Complete/duplicate ist kein Lesen; nur bestaetigter exakter CAS-Replay heilt Save-vor-Payload-Absturz", async () => {
    const ready = { ...docs[0], summary: "Die Gewerkschaft fordert verbindliche Tarife für alle Beschäftigten und bessere soziale Absicherung. Die nächste Verhandlungsrunde beginnt im November." };
    const oneJob = { ...job, payload: { dokumentIds: [ready.id] } };
    for (const r of [{ status: "complete", promptDokumentIds: [ready.id] }, { status: "duplicate", promptDokumentIds: [ready.id] },
      { status: "duplicate", begruendung: "eingabe-bereits-verstanden", promptDokumentIds: [ready.id] }]) {
      const out = await understanding(oneJob, deps({ ladeRohdokumente: async () => [ready],
        vorbereiteGespeicherteInhalte: async () => result([ready]), eagerUnderstanding: async () => ({ processed: 1, results: [r] })
      }), { auftragsDeadlineMs: start + 120000 });
      assert.equal(out.zurueckgestellt, true); assert.equal(out.fortschrittPayload, undefined);
    }
    const out = await understanding(oneJob, deps({ ladeRohdokumente: async () => [ready],
      vorbereiteGespeicherteInhalte: async () => result([ready]), eagerUnderstanding: async () => ({ processed: 1,
        results: [{ status: "duplicate", begruendung: "eingabe-bereits-verstanden", promptBereitsGespeichert: true, promptDokumentIds: [ready.id] }] })
    }), { auftragsDeadlineMs: start + 120000 });
    assert.equal(out.ok, true); assert.deepEqual(out.fortschrittPayload.quellenRestDokumentIds, []);
  });
  await test("Unbestaetigter Fortschrittswrite beendet und vertagt den Job nicht falsch", async () => {
    let finish = 0, defer = 0;
    const r = await P.fuehreAuftragAus({ auftrag: { id: "patch-unbekannt", job_type: "document_understanding", payload: { dokumentIds: [docs[0].id] } },
      besitzer: "test", deps: { now: () => start, handler: { document_understanding: async () => ({ ok: false, zurueckgestellt: true,
        fortschrittPayload: { dokumentIds: [docs[0].id], quellenRestDokumentIds: [] } }) },
      fortschritt: async () => ({ verfuegbar: true, uebernommen: false }),
      finish: async () => { finish++; }, zurueckstellen: async () => { defer++; } } });
    assert.equal(r.ausgang, "fortschritt-nicht-uebernommen"); assert.equal(finish + defer, 0);
  });
  await test("Regulaere Planung holt rotierenden Pendingbestand ohne frischen Feed vor Quellenplanung", async () => {
    const offsets = [], jobs = [];
    for (const day of [start, start + 86400000]) {
      let enqueued = 0;
      const r = await P.planeArbeit({ jetztMs: day, env: { ...env, HELMUT_SCALABLE_PIPELINE: "on" }, deps: {
        listFullProfiles: async () => [profile], zaehlePendingVerarbeitbar: async () => 10,
        listPendingKnowledgeObjects: async opts => { assert.equal(opts.limit, 5); offsets.push(opts.offset);
          return [{ id: `pending-${opts.offset}` }]; },
        listKoDocuments: async (_, limit) => { assert.equal(limit, 40); return docs; },
        enqueue: async input => { enqueued++; jobs.push(input); return { verfuegbar: true, neu: true }; },
        sourceDemand: { kompiliereQuellenbedarf: async () => { assert.equal(enqueued, 1); return { auftraege: [], statistik: {} }; },
          planeMandatsarbeit: () => ({ auftraege: [] }) }
      } });
      assert.equal(r.ok, true); assert.equal(r.pendingIngress.dokumente, 2);
    }
    assert.notEqual(offsets[0], offsets[1]); assert.equal(jobs[0].idempotencyKey, jobs[1].idempotencyKey);
    assert.equal(jobs[0].tenantId, null); assert.deepEqual(jobs[0].payload.dokumentIds, docs.map(d => d.id).sort());
  });
  await test("Bestehender Speicheradapter schreibt Fortschritt nur mit Payload-, Besitzer-, Status- und Lease-CAS", async () => {
    const S = require("../lib/helmut/storage");
    const beforeEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.SUPABASE_URL = "http://127.0.0.1:1"; process.env.SUPABASE_SERVICE_ROLE_KEY = "isolierte-attrappe";
    try {
      const id = "11111111-2222-4333-8444-555555555555", previous = { dokumentIds: docs.map(d => d.id) };
      const next = { ...previous, quellenRestDokumentIds: [docs[1].id] };
      for (const change of [{}, { owner: "fremd" }, { payload: next }, { status: "wartend" }, { lease: "2000-01-01T00:00:00Z" }]) {
        const row = { owner: "test", payload: previous, status: "laeuft", lease: "2099-01-01T00:00:00Z", ...change };
        let writes = 0;
        const r = await S.jobQueueFortschritt({ id, owner: "test", vorher: previous, payload: next }, { request: async (endpoint, opts) => {
          const q = new URL(endpoint, "https://local.invalid").searchParams;
          assert.equal(q.get("id"), "eq." + id); assert.equal(q.get("job_type"), "eq.document_understanding");
          assert.equal(opts.method, "PATCH"); assert.equal(opts.headers.Prefer, "return=representation");
          const match = q.get("lease_owner") === "eq." + row.owner && q.get("status") === "eq." + row.status
            && Date.parse(row.lease) > Date.parse(q.get("lease_expires_at").slice(3))
            && JSON.stringify(row.payload) === JSON.stringify(JSON.parse(q.get("payload").slice(3)));
          if (!match) return [];
          assert.deepEqual(JSON.parse(opts.body).payload, next); writes++; return [{ id }];
        } });
        assert.equal(r.uebernommen, Object.keys(change).length === 0); assert.equal(writes, r.uebernommen ? 1 : 0);
      }
    } finally {
      if (beforeEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = beforeEnv.url;
      if (beforeEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = beforeEnv.key;
    }
  });
  await test("Negative Cacheluecke/Hostblock parkt eine Stunde ohne Leerlaufpolling oder Modell", async () => {
    for (const reason of ["http-status", "herausgeber-nicht-freigegeben", "anbietergrenze"]) {
      let clock = start, due = start, sleeps = 0, prepared = 0;
      const row = { id: "negative-cache", job_type: "document_understanding", payload: job.payload,
        created_at: new Date(start).toISOString(), attempts: 1 };
      const r = await P.arbeite({ env: { ...env, HELMUT_SCALABLE_PIPELINE: "on" }, budgetMs: 240000,
        leaseMs: 300000, stapel: 1, leerlaufWarteMs: 10000, deps: deps({ now: () => clock, budget: null,
          claim: async () => ({ verfuegbar: true, auftraege: clock >= due ? [row] : [] }),
          vorbereiteGespeicherteInhalte: async () => { prepared++; return { ...result(docs),
            befund: docs.map(d => ({ id: d.id, status: "luecke", reason })) }; },
          zurueckstellen: async args => { assert.equal(args.delayMs, 3600000); due = clock + args.delayMs;
            return { verfuegbar: true, uebernommen: true }; },
          schlafe: async ms => { sleeps++; clock += ms; },
          eagerUnderstanding: async () => { throw Error("Modell ohne Inhalt"); }, finish: async () => { throw Error("Kein Abschluss"); }
        }) });
      assert.equal(r.zurueckgestellt, 1); assert.equal(r.kurzZurueckgestellt, 0);
      assert.equal(r.leerlaufWarten, 0); assert.equal(sleeps, 0); assert.equal(prepared, 1);
    }
  });
  await test("Kurze Fortsetzung wartet virtuell 10 Sekunden und endet innerhalb vorhandenen Slotbudgets", async () => {
    let clock = start, due = start, done = false, calls = 0, sleeps = 0;
    const row = { id: "short-rest", job_type: "document_understanding", payload: {} };
    const r = await P.arbeite({ env: { HELMUT_SCALABLE_PIPELINE: "on" }, budgetMs: 35000, leaseMs: 300000,
      stapel: 1, leerlaufWarteMs: 10000, deps: { now: () => clock, budget: null,
        claim: async () => ({ verfuegbar: true, auftraege: !done && clock >= due ? [row] : [] }),
        handler: { document_understanding: async () => ++calls === 1
          ? { ok: false, zurueckgestellt: true, grund: "echte-restfortsetzung" } : { ok: true } },
        zurueckstellen: async args => { assert.equal(args.delayMs, 10000); due = clock + args.delayMs;
          return { verfuegbar: true, uebernommen: true }; },
        finish: async () => { done = true; return { verfuegbar: true, uebernommen: true }; },
        schlafe: async ms => { sleeps++; clock += ms; }
      } });
    assert.equal(r.erledigt, 1); assert.equal(calls, 2); assert.ok(sleeps >= 1 && sleeps <= 3); assert.ok(clock - start < 35000);
  });
  await test("Inneres Budgetnein nach aeusserer Freigabe benutzt die bestehende Stundenpause", async () => {
    const ready = { ...docs[0], summary: "Die Gewerkschaft fordert verbindliche Tarife für alle Beschäftigten und bessere soziale Absicherung. Die nächste Verhandlungsrunde beginnt im November." };
    let released = false;
    const out = await understanding({ ...job, payload: { dokumentIds: [ready.id] } }, deps({
      ladeRohdokumente: async () => [ready], vorbereiteGespeicherteInhalte: async () => result([ready]),
      budget: { reserviere: async () => ({ erlaubt: true }), melde: async r => { released = r.ungenutzt; } },
      eagerUnderstanding: async () => ({ processed: 1, counts: { "skipped-budget": 1 } })
    }), { auftragsDeadlineMs: start + 120000 });
    assert.equal(out.zurueckgestellt, true); assert.equal(out.langeWarten, true); assert.equal(released, true);
  });
  await test("Echte Kontingentfortsetzung bleibt kurz; fremde Kontext-ID erweitert niemals Jobfortschritt", async () => {
    const out = await understanding(job, deps({ vorbereiteGespeicherteInhalte: async () => ({ ...result(docs),
      befund: docs.map(d => ({ id: d.id, status: "vertagt", reason: "laufgrenze" })) }),
      eagerUnderstanding: async () => { throw Error("Keine bereitgestellte Quelle"); }
    }), { auftragsDeadlineMs: start + 120000 });
    assert.equal(out.langeWarten, false);
    const ready = { ...docs[0], summary: "Die Gewerkschaft fordert verbindliche Tarife für alle Beschäftigten und bessere soziale Absicherung. Die nächste Verhandlungsrunde beginnt im November." };
    const r = await understanding({ ...job, payload: { dokumentIds: [ready.id] } }, deps({
      ladeRohdokumente: async () => [ready], vorbereiteGespeicherteInhalte: async () => result([ready]),
      eagerUnderstanding: async () => ({ processed: 1, results: [{ status: "updated", promptDokumentIds: [docs[1].id, ready.id] }] })
    }), { auftragsDeadlineMs: start + 120000 });
    assert.equal(r.ok, true); assert.deepEqual(r.fortschrittPayload, { dokumentIds: [ready.id], quellenRestDokumentIds: [] });
  });
  console.log(`${count}/${count} Queue-Inhaltsversorgung PASS`);
})().catch(error => { console.error(error); process.exitCode = 1; });
