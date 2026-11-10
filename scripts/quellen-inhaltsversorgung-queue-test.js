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
  await test("36 geladene Artikel bleiben in mehreren versionsgebundenen Portionen erhalten", async () => {
    const items = Array.from({ length: 36 }, (_, n) => ({ ...docs[0], id: "rd-" + (n + 1).toString(16).padStart(64, "0") }));
    const hashes = Object.fromEntries(items.map((d, n) => [d.id, String(n % 10).repeat(64)]));
    const jobs = [];
    const d = { hardeningConfig: () => ({ enabled: false }),
      crawlAllSources: async () => ({ rawItems: items.slice(0, 25), results: [{ ok: true, items }] }),
      persistRohdokumente: async () => ({ ok: true, neuIds: [], bestaetigteIds: items.map(x => x.id), quellenstaende: hashes }),
      enqueue: async j => { jobs.push(j); return { verfuegbar: true, neu: true }; } };
    await P.HANDLER.source_fetch({ id: "version-batches", payload: { quelle: { id: "q" } } }, d);
    assert.deepEqual(jobs.map(j => j.payload.dokumentIds.length), [25, 11]);
    assert.equal(new Set(jobs.flatMap(j => j.payload.dokumentIds)).size, 36);
    assert(jobs.every(j => j.payload.dokumentIds.every(id => j.payload.quellenstaende[id] === hashes[id])));
    const vorher = jobs.map(j => j.idempotencyKey); jobs.length = 0;
    hashes[items[0].id] = "a".repeat(64);
    await P.HANDLER.source_fetch({ id: "changed-version", payload: { quelle: { id: "q" } } }, d);
    assert.notEqual(jobs[0].idempotencyKey, vorher[0]); assert.equal(jobs[1].idempotencyKey, vorher[1]);
  });
  await test("Unterbrochene Tagesplanung setzt bestaetigten Rest fort ohne erneute Quellenplanung", async () => {
    let plan = null, clock = 0, kompiliert = 0;
    const seen = new Set();
    const journal = { lesen: async () => plan,
      offene: async () => ({ plaene: plan?.zustand === "offen" ? [plan] : [], weitereVorhanden: false }),
      sichereManifest: async (tag, data) => (plan = { ...data, tag, cursor: 0, zustand: "offen" }),
      bewegeCursor: async (tag, vor, next) => (plan = { ...plan, cursor: next,
        zustand: next === plan.auftraege.length ? "fertig" : "offen" }) };
    const jobs = Array.from({ length: 36 }, (_, n) => ({ jobType: "source_fetch", idempotencyKey: "resume-" + n, payload: { quelle: { id: "q" + n } } }));
    const dep = { planungsrest: journal, now: () => clock, listFullProfiles: async () => [],
      sourceDemand: { kompiliereQuellenbedarf: async () => { kompiliert++; return { auftraege: jobs, statistik: {} }; },
        planeMandatsarbeit: () => ({ auftraege: [], fenster: "2026-11-09T00Z" }) },
      enqueue: async j => { const neu = !seen.has(j.idempotencyKey); seen.add(j.idempotencyKey); clock++; return { verfuegbar: true, neu }; } };
    const e = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_JOB_DISPATCH_MODE: "off" };
    const first = await P.setzePlanungFort({ env: e, deps: dep, jetztMs: start, darfNeuPlanen: true, planungsDeadlineMs: 13 });
    assert.equal(first.ausstehend, 23); assert.equal(seen.size, 13);
    const next = await P.setzePlanungFort({ env: e, deps: dep, jetztMs: start + 900000, darfNeuPlanen: true, planungsDeadlineMs: 100 });
    assert.equal(next.ok, true); assert.equal(plan.cursor, 36); assert.equal(seen.size, 36); assert.equal(kompiliert, 1);
    await P.setzePlanungFort({ env: e, deps: dep, jetztMs: start + 1800000, darfNeuPlanen: true, planungsDeadlineMs: 150 });
    assert.equal(kompiliert, 1); assert.equal(seen.size, 36);
  });
  await test("Abschnittsrest ist kurze fortsetzbare Arbeit und bestaetigt das Dokument erst nach dem letzten Teil", async () => {
    const doc = { ...docs[0], summary: Array.from({ length: 200 }, (_, n) => `Die Tarifparteien beraten Thema ${n} und vereinbaren konkrete Schritte zur weiteren sozialen Absicherung.`).join(" ") };
    const B = require("../lib/helmut/artikel-abschnitte"), bundle = B.segmentiere(doc.summary);
    let payload = { dokumentIds: [doc.id] };
    for (let index = 0; index < bundle.count; index++) {
      const r = await understanding({ ...job, payload }, deps({ env: { ...env, HELMUT_QUELLEN_ARBEITSFENSTER: "on" },
        ladeRohdokumente: async () => [doc], vorbereiteGespeicherteInhalte: async () => result([doc]),
        eagerUnderstanding: async (_rows, opts) => {
          assert.equal(opts.quellenAbschnitte[doc.id] || 0, index);
          return { processed: 1, results: [{ status: "updated", promptDokumentIds: [doc.id], promptAbschnitte: { [doc.id]: B.waehle(bundle, index) } }] };
        }
      }), { auftragsDeadlineMs: start + 120000 });
      payload = r.fortschrittPayload;
      if (index + 1 < bundle.count) { assert.equal(r.zurueckgestellt, true); assert.equal(r.langeWarten, false);
        assert.equal(payload.quellenAbschnitte[doc.id], index + 1); assert.deepEqual(payload.quellenRestDokumentIds, [doc.id]); }
      else { assert.equal(r.ok, true); assert.deepEqual(payload.quellenRestDokumentIds, []); }
    }
  });
  await test("Linkfehler nach CAS-Save und beim kostenlosen Replay behalten Rest bis zur bestaetigten Herkunft", async () => {
    const U = require("../lib/helmut/understanding"), V = require("../lib/helmut/verstehen-vertrag");
    const linkNow = Date.now(), linkDeadline = linkNow + 120000;
    const ready = D.toRawDocumentRow({ title: "Ausschuss vertagt Foerderprogramm", sourceName: "Isolierte Redaktion", sourceType: "media",
      url: "https://fixture.invalid/foerderprogramm", publishedAt: "2026-11-09T04:00:00Z",
      summary: "Der Ausschuss vertagt die Beratung zum Förderprogramm. Die Mitglieder wollen zunächst weitere Unterlagen zur sozialen Absicherung prüfen." });
    const answer = { headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
      parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel",
      handlungsempfehlung: "a", confidence_score: 70, display_title: "Ausschuss vertagt Foerderprogramm",
      display_summary: "s", why_relevant: "w", recommendation: "r", display_category: "Haushalt" };
    for (const failure of ["throw", "skipped"]) {
      const world = { calls: 0, saved: null, links: [], broken: true, unexpected: false, stale: false, cas: "offen", inputHash: null,
        nextUpdate: false, marker: null, clearFencings: [] };
      const storage = {
        verstehenReserviere: async ({ eingabeHash }) => {
          if (world.saved && !world.nextUpdate) {
            assert.equal(eingabeHash, world.inputHash, "Replay bindet dieselbe gespeicherte Eingabe");
            return { verfuegbar: true, erlaubt: false, grund: "bereits-fertig", zustand: "fertig", fencing: 1 };
          }
          world.inputHash = eingabeHash;
          const fencing = world.nextUpdate ? 2 : 1; world.nextUpdate = false;
          return { verfuegbar: true, erlaubt: true, zustand: "reserviert", fencing, versuche: 1 };
        },
        verstehenModellstart: async () => ({ verfuegbar: true, ok: true }),
        verstehenSchreibrecht: async () => ({ verfuegbar: true, ok: true }),
        verstehenSpeichere: async ({ ko }) => { world.saved = structuredClone(ko); world.cas = "fertig";
          return { verfuegbar: true, ergebnis: "gespeichert" }; },
        verstehenAusgangUnbekannt: async () => { world.cas = "unbekannt"; return { verfuegbar: true, blockiert: true, ergebnis: "unbekannt" }; },
        verstehenFreigabe: async () => { throw Error("Kein erneuter Modellversuch"); },
        verstehenVormerkungLese: async () => ({ verfuegbar: true,
          eintraege: world.marker ? { [world.saved.vorgang_id]: world.marker.fehlversuche } : {} }),
        verstehenVormerkungErhoehe: async () => { throw Error("Linkfehler erzeugt keinen Modellretry"); },
        verstehenVormerkungLoese: async ({ vorgangId, fencing }) => {
          assert.equal(vorgangId, world.saved.vorgang_id); world.clearFencings.push(fencing);
          if (world.marker && world.marker.letzte_fencing <= fencing) world.marker = null;
          return { verfuegbar: true, ok: true };
        }
      };
      const inner = { enabled: () => true, aiEnabled: () => true,
        acquireLock: async () => ({ granted: true }), releaseLock: async () => {}, clusterWache: null,
        verstehenVertrag: () => V.baueVertrag({ besitzer: "queue-link-fixture", deps: { erzwingeAktiv: true, speicher: storage } }),
        getExisting: async () => world.stale ? null : world.saved,
        getExistingStreng: async () => world.stale ? null : world.saved,
        findVorgangCandidates: async () => [], listVorgangDocuments: async () => world.links,
        listPending: async () => [], canSpend: async () => ({ allowed: true }),
        requestUnderstanding: async () => { world.calls++; return structuredClone(answer); },
        save: async () => { throw Error("Nur CAS-Speicherweg"); },
        saveSources: async (_id, rows) => {
          if (world.unexpected) return Object.defineProperty({}, "saved", { get() { throw Error("unlesbare-linkquittung"); } });
          if (world.broken) { if (failure === "throw") throw Error("isolierter-linkfehler");
            return { skipped: true, reason: "v3-store-error", saved: 0 }; }
          world.links = [...new Map([...world.links, ...rows].map(d => [d.id, d])).values()];
          return { saved: rows.length };
        },
        markFailed: async () => { throw Error("Gueltige Fixtureantwort"); }, savePending: async () => ({ saved: true }),
        readUpdateRetries: async () => ({}), writeUpdateRetries: async () => ({ saved: true }),
        modelName: () => "gpt-5-mini", logSkip: () => {}, gateMode: () => "off"
      };
      let engine;
      const d = deps({ env: { HELMUT_ARTIKELKONTEXT: "on", HELMUT_SUCHWEGAUSZUEGE_HOSTS: "fixture.invalid" },
        now: () => linkNow,
        ladeRohdokumente: async () => [ready], vorbereiteGespeicherteInhalte: async () => result([ready]),
        eagerUnderstanding: async (rows, opts) => { engine = await U.runUnderstandingShadow(rows, { ...inner, ...opts }); return engine; } });
      let current = { ...job, createdAt: new Date(linkNow).toISOString(), payload: { dokumentIds: [ready.id] } };
      const first = await understanding(current, d, { auftragsDeadlineMs: linkDeadline });
      assert.equal(engine.results[0].status, "skipped-store");
      assert.equal(engine.results[0].promptDokumentIds, undefined);
      assert.equal(first.ok, false); assert.equal(first.zurueckgestellt, true);
      assert.equal(first.fortschrittPayload, undefined); assert.equal(world.links.length, 0);
      assert.equal(world.saved.understanding_status, "complete"); assert.equal(world.cas, "fertig"); assert.equal(world.calls, 1);
      // Ein fremder Lauf darf zwischen Bestandslesung und CAS fertig werden.
      // Auch dieser CAS-Replay muss Links bestaetigen, bevor er Rest quittiert.
      world.stale = true;
      const replay = await understanding(current, d, { auftragsDeadlineMs: linkDeadline });
      assert.equal(engine.results[0].status, "skipped-store");
      assert.equal(engine.results[0].promptBereitsGespeichert, undefined);
      assert.equal(replay.ok, false); assert.equal(replay.fortschrittPayload, undefined); assert.equal(world.calls, 1);
      // Auch eine unerwartete Ausnahme ausserhalb des Sourcewrite-Catchs
      // darf nicht durch den Replay-Catch zu einer Erfolgsquittung werden.
      world.unexpected = true;
      const unreadableReceipt = await understanding(current, d, { auftragsDeadlineMs: linkDeadline });
      assert.equal(engine.results[0].status, "skipped-store");
      assert.equal(engine.results[0].promptBereitsGespeichert, undefined);
      assert.equal(unreadableReceipt.ok, false); assert.equal(unreadableReceipt.fortschrittPayload, undefined);
      assert.equal(world.calls, 1); world.unexpected = false;
      world.broken = false;
      const recovered = await understanding(current, d, { auftragsDeadlineMs: linkDeadline });
      assert.equal(recovered.ok, true); assert.deepEqual(recovered.fortschrittPayload.quellenRestDokumentIds, []);
      assert.equal(engine.results[0].promptBereitsGespeichert, true); assert.equal(world.calls, 1);
      assert.deepEqual(world.links.map(d => d.id), [ready.id]);
      // Der reguläre Complete-/Lektuere-Replay bestaetigt denselben Link ebenfalls kostenlos.
      world.stale = false; world.broken = true;
      const existingBlocked = await understanding(current, d, { auftragsDeadlineMs: linkDeadline });
      assert.equal(existingBlocked.ok, false); assert.equal(existingBlocked.fortschrittPayload, undefined);
      world.broken = false;
      const existingRecovered = await understanding(current, d, { auftragsDeadlineMs: linkDeadline });
      assert.equal(existingRecovered.ok, true); assert.equal(world.calls, 1);
      assert.deepEqual(existingRecovered.fortschrittPayload.quellenRestDokumentIds, []);
      // Ein tatsaechlich gespeicherter UPDATE mit alter Vormerkung2 beendet
      // diese Modellarbeit auch bei einem nachfolgenden Linkwritefehler.
      const next = D.toRawDocumentRow({ ...ready, id: undefined, content_hash: undefined,
        url: "https://fixture.invalid/foerderprogramm-fortsetzung", canonical_url: undefined,
        title: "Ausschuss beraet weitere Foerdermittel", summary: "Der Ausschuss berät weitere Fördermittel für die soziale Absicherung. Die Mitglieder haben dafür zusätzliche Unterlagen zur Prüfung erhalten." });
      assert.notEqual(next.id, ready.id);
      world.marker = { fehlversuche: 2, letzte_fencing: 1 }; world.nextUpdate = true; world.broken = true;
      const updateDeps = { ...d, ladeRohdokumente: async () => [ready, next],
        vorbereiteGespeicherteInhalte: async () => result([ready, next]),
        eagerUnderstanding: async (rows, opts) => {
          const updated = await U.understandUpdate({ documents: rows, anchors: [] }, { ...inner, ...opts }, {
            vorgangId: world.saved.vorgang_id, existing: world.saved, neueDocs: [next], alleDocs: rows, spur: {}, neueAnker: [],
            vertrag: inner.verstehenVertrag(), quellenRestDokumentIds: opts.quellenRestDokumentIds, deadlineMs: opts.deadlineMs });
          engine = { processed: 1, results: [updated], counts: { [updated.status]: 1 } }; return engine;
        } };
      const updateJob = { ...current, payload: { dokumentIds: [ready.id, next.id], quellenRestDokumentIds: [next.id] } };
      const updateBlocked = await understanding(updateJob, updateDeps, { auftragsDeadlineMs: linkDeadline });
      assert.equal(engine.results[0].status, "skipped-store"); assert.equal(updateBlocked.ok, false);
      assert.equal(updateBlocked.fortschrittPayload, undefined); assert.equal(world.saved.ko_version, 2);
      assert.equal(world.cas, "fertig"); assert.equal(world.calls, 2);
      assert.equal(world.marker, null, "Bestaetigter Modellupdate loest alte Vormerkung trotz Linkfehler auf");
      assert.deepEqual(world.clearFencings, [2], "Aufloesen nutzt den bestaetigten aktuellen CAS-Fencingwert");
      world.broken = false;
      const updateRecovered = await understanding(updateJob, updateDeps, { auftragsDeadlineMs: linkDeadline });
      assert.equal(updateRecovered.ok, true); assert.equal(engine.results[0].promptBereitsGespeichert, true);
      assert.deepEqual(updateRecovered.fortschrittPayload.quellenRestDokumentIds, []);
      assert.equal(world.marker, null); assert.equal(world.calls, 2, "Update-Linkerholung startet kein zweites Modell");
      const afterUpdate = await U.duplikatBrauchtAufruf(inner, null, world.saved.vorgang_id, inner.verstehenVertrag());
      assert.equal(afterUpdate.aufruf, false, "Keine alte Vormerkung fordert spaeter eine unnoetige Modellwiederholung");
    }
  });
  const DIP = require("../lib/helmut/dip"), S = require("../lib/helmut/scheduler"), Q = require("../lib/helmut/dip-quellfelder");
  const katalog = { retrievalPaths: [{ id: "rp-dip", legacy_source_id: "dip", publisher_id: "publisher-dip.bundestag.de",
    method: "api", parser: "dip-json", url: "https://search.dip.bundestag.de/api/v1", status: "healthy", activation_mode: "always_on" }], packages: [], packagePaths: [] };
  const original = { id: 990010, titel: "Pruefung des Mindestlohns und der sozialen Beratung", datum: "2026-11-08", aktualisiert: "2026-11-09",
    drucksachetyp: "Antwort", dokumentart: "Drucksache", urheber: [{ titel: "Bundesregierung" }], ressort: [{ titel: "Bundesministerium fuer Arbeit" }],
    fundstelle: { pdf_url: "https://dserver.bundestag.de/btd/21/099/2109910.pdf" } };
  const dipJob = { id: "dip-offline", tenantId: profile.id, payload: { mandatsId: profile.id,
    quelle: { id: "dip", retrievalPathId: "rp-dip", url: "https://search.dip.bundestag.de/api/v1", crawlMethod: "dip" } } };
  const dipEnv = { ...env, DIP_API_KEY: "declared-offline-only", HELMUT_ANBIETER_STEUERUNG: "on" };
  const dipDeps = extra => ({ env: dipEnv, now: () => start, listFullProfiles: async () => [profile], leseDipKatalog: async () => katalog,
    dipDocToRawItem: doc => S.dipDocToRawItem(doc, { primary: true }), ...extra });
  await test("DIP bleibt derselbe Sourcejob im bestaetigten Manifest; andere Wege bleiben identisch", async () => {
    const plans = [];
    for (const active of [false, true]) {
      let manifest = null; const jobs = [];
      const journal = { lesen: async () => manifest, sichereManifest: async (tag, data) => (manifest = { tag, ...data, cursor: 0, zustand: "offen" }),
        bewegeCursor: async (_tag, before, cursor) => (manifest = { ...before, cursor, zustand: cursor === before.auftraege.length ? "fertig" : "offen" }) };
      const r = await P.planeArbeit({ jetztMs: start, env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on",
        ...(active ? { DIP_API_KEY: "declared-offline-only" } : {}) }, deps: {
        listFullProfiles: async () => [profile], planungsrest: journal,
        quellenFuerProfil: async () => [{ id: "unchanged", active: true, type: "media", rssUrl: "https://offline.invalid/rss" }],
        enqueue: async j => { jobs.push(j); return { verfuegbar: true, neu: true }; }
      } });
      assert.equal(r.ok, true); assert.equal(manifest.cursor, jobs.length); plans.push(jobs);
    }
    const added = plans[1].filter(j => j.payload.quelle?.crawlMethod === "dip");
    assert.equal(added.length, 1); assert.equal(added[0].jobType, "source_fetch");
    assert.equal(added[0].tenantId, profile.id); assert(!JSON.stringify(added).includes("declared-offline-only"));
    assert.deepEqual(plans[1].filter(j => j.payload.quelle?.crawlMethod !== "dip"), plans[0]);
  });
  await test("DIP Sourcejob erhaelt Datums-/Quellfelder, Fundstellenweg und gemeinsame Persistenz/Understanding", async () => {
    const accepted = [], queued = [];
    const normalized = DIP.normalizeDrucksache(original);
    const r = await P.HANDLER.source_fetch(dipJob, dipDeps({ dipQueueDocuments: async () => [normalized],
      persistRohdokumente: async items => { accepted.push(...items); const ids = items.map(x => D.toRawDocumentRow(x).id);
        return { ok: true, neuIds: ids, bestaetigteIds: ids }; }, enqueue: async j => { queued.push(j); return { verfuegbar: true, neu: true }; }
    }), { auftragsDeadlineMs: start + 120000 });
    assert.equal(r.ok, true); assert.equal(accepted.length, 1); assert.equal(accepted[0].retrievalPathId, "rp-dip");
    assert.equal(accepted[0].publishedAt, original.datum); assert(Q.lese(accepted[0]));
    assert.equal(queued[0].jobType, "document_understanding"); assert.equal(queued[0].tenantId, null);
    assert.equal(queued[0].payload.dokumentIds.length, 1);
    const undated = S.dipDocToRawItem(DIP.normalizeDrucksache({ ...original, datum: undefined }), { primary: true });
    assert.equal(undated.publishedAt, null); assert.equal(Q.lese(undated).datum, null);
  });
  await test("DIP Admission, Profil, Kosten und Restzeit sperren VOR dem Abruf", async () => {
    let calls = 0;
    const d = dipDeps({ dipQueueDocuments: async () => { calls++; throw Error("nicht erreichen"); } });
    assert.equal((await P.HANDLER.source_fetch(dipJob, { ...d, leseDipKatalog: async () => ({ ...katalog,
      retrievalPaths: [{ ...katalog.retrievalPaths[0], status: "paused" }] }) }, { auftragsDeadlineMs: start + 120000 })).uebersprungen, true);
    assert.equal((await P.HANDLER.source_fetch(dipJob, { ...d, listFullProfiles: async () => [{ ...profile, profileActive: false }] },
      { auftragsDeadlineMs: start + 120000 })).uebersprungen, true);
    assert.equal((await P.HANDLER.source_fetch(dipJob, d, { auftragsDeadlineMs: start + 20000 })).zurueckgestellt, true);
    await assert.rejects(P.HANDLER.source_fetch({ ...dipJob, tenantId: "fremd" }, d, { auftragsDeadlineMs: start + 120000 }), /dip-auftrag/);
    await assert.rejects(P.HANDLER.source_fetch(dipJob, { ...d, listFullProfiles: async () => [profile, { ...profile, id: "fremd" }] },
      { auftragsDeadlineMs: start + 120000 }), /aktive-profile-abweichend/);
    assert.equal(calls, 0);
    let deferred = 0, finished = 0;
    for (const error of [Object.assign(new Error("dip-zeitbudget"), { code: "DIP_TIME_BUDGET" }),
      Object.assign(new Error("dip-lease-verloren"), { anbieterVertagung: { grund: "klassen-lease-verloren", wartenMs: 5000 } })]) {
      const r = await P.fuehreAuftragAus({ auftrag: { ...dipJob, job_type: "source_fetch", tenant_id: profile.id }, besitzer: "dip-offline", leaseMs: 300000,
        deps: { ...d, handler: P.HANDLER, dipQueueDocuments: async () => { throw error; },
          zurueckstellen: async () => { deferred++; return { verfuegbar: true }; }, finish: async () => { finished++; } } });
      assert.equal(r.ausgang, "zurueckgestellt"); assert.equal(r.bilanz.nachTyp.source_fetch.fehler, 0);
    }
    assert.equal(deferred, 2); assert.equal(finished, 0);
  });
  await test("DIP Metadaten gelangen nur mit konkretem echten Fund und aktuellem Profil in Inhaltsvorbereitung", async () => {
    const Anschluss = require("../lib/helmut/quellen-inhaltsversorgung-anschluss");
    const doc = D.toRawDocumentRow({ ...S.dipDocToRawItem(DIP.normalizeDrucksache(original), { primary: true }), retrievalPathId: "rp-dip" });
    const finding = { raw_document_id: doc.id, source_id: "dip", retrieval_path_id: "rp-dip", original_url: doc.url };
    const run = (d, f, p = profile, k = katalog) => Anschluss.vorbereiteGespeicherteInhalte({ auftrag: { vorbereitet: true, hosts: [] },
      dokumente: [d], profile: [p], laufId: "dip-offline", now: () => start, deadlineMs: start + 120000 }, {
      leseKatalog: async () => k, quellenFuerProfil: async () => [], request: async () => f });
    assert.equal((await run(doc, [finding])).dokumente.length, 1);
    assert.equal((await run(doc, [{ ...finding, original_url: "https://dserver.bundestag.de/fremd.pdf" }])).dokumente.length, 0);
    assert.equal((await run(doc, [{ ...finding, retrieval_path_id: null }])).dokumente.length, 0);
    assert.equal((await run({ ...doc, title: "Manipuliert" }, [finding])).dokumente.length, 0);
    assert.equal((await run(doc, [finding], { ...profile, committee: "Finanzen", focusTopics: ["Steuerrecht"] })).dokumente.length, 0);
    assert.equal((await run(doc, [finding], profile, { ...katalog, retrievalPaths: [{ ...katalog.retrievalPaths[0], status: "paused" }] })).dokumente.length, 0);
  });
  await test("DIP Queueclient nutzt Headerauth, Providerreserve und Zwoelferfilter; Fehler und echter Abort bleiben ehrlich", async () => {
    let calls = 0, reservations = 0, clock = start + 8 * 86400000;
    const bounds = { env: dipEnv, now: () => clock, deadlineMs: clock + 60000,
      anbieterDeps: { reserviere: async () => { reservations++; return { verfuegbar: true, erlaubt: true }; }, melde: async () => ({ verfuegbar: true }) },
      fetch: async (url, opts) => {
        calls++; assert(!url.includes("declared-offline-only")); assert(!url.includes("apikey"));
        assert.equal(opts.headers.Authorization, "ApiKey declared-offline-only"); assert.equal(opts.redirect, "error"); assert(opts.signal);
        return new Response(JSON.stringify({ documents: Array.from({ length: 15 }, (_, i) => ({ ...original, id: original.id + i })) }), { headers: { "content-type": "application/json" } });
      } };
    const docs = await DIP.getQueueDocuments(profile, bounds); assert.equal(docs.length, 12); assert.equal(calls, 1); assert.equal(reservations, 1);
    clock += 3600000;
    await assert.rejects(DIP.getQueueDocuments(profile, { ...bounds, env: { ...dipEnv, HELMUT_ANBIETER_STEUERUNG: "off" },
      deadlineMs: clock + 60000 }), /dip-anbietersteuerung-nicht-aktiv/);
    assert.equal(calls, 1);
    await assert.rejects(DIP.getQueueDocuments(profile, { ...bounds, deadlineMs: clock + 60000,
      anbieterDeps: { ...bounds.anbieterDeps, reserviere: async () => ({ verfuegbar: true, erlaubt: false, grund: "tagesgrenze" }) } }), /dip-anbietergrenze/);
    assert.equal(calls, 1);
    await assert.rejects(DIP.getQueueDocuments(profile, { ...bounds, deadlineMs: clock + 60000,
      fetch: async () => { throw new Error("https://secret.invalid/declared-offline-only"); } }), error => error.message === "dip-abruf-fehlgeschlagen");
    await assert.rejects(DIP.getQueueDocuments(profile, { ...bounds, env: { ...dipEnv, CRAWLER_TIMEOUT_MS: "5" }, deadlineMs: clock + 60000,
      fetch: async (_url, opts) => new Promise((_resolve, reject) => opts.signal.addEventListener("abort", () => reject(new Error("sensitive")), { once: true })) }), /dip-abruf-timeout/);
    const reports = [];
    await assert.rejects(DIP.getQueueDocuments(profile, { ...bounds, deadlineMs: clock + 60000,
      anbieterDeps: { ...bounds.anbieterDeps, melde: async data => { reports.push(data); return { verfuegbar: true }; } },
      fetch: async () => { throw Object.assign(new TypeError("fetch failed"), { cause: new Error("connect ECONNRESET declared-offline-only") }); }
    }), /dip-abruf-fehlgeschlagen/);
    assert.equal(reports.length, 1); assert.equal(reports[0].ok, false);
    assert(!JSON.stringify(reports).includes("declared-offline-only"));
    clock += 3600000;
    let intervalStarts = 0, intervalStops = 0, renewals = 0, pages = 0, tick;
    const leaseBounds = { ...bounds, deadlineMs: clock + 60000, slot: { id: "isolierter-slot" },
      klassen: { erneuere: async () => { renewals++; return { erneuert: true }; } },
      anbieterDeps: { ...bounds.anbieterDeps, setInterval: fn => { tick = fn; intervalStarts++; return "isolierter-timer"; },
        clearInterval: () => { intervalStops++; } },
      fetch: async () => { await tick(); pages++; return new Response(JSON.stringify({ documents: [{ ...original, id: original.id + pages }],
        cursor: pages < 3 ? "declared-cursor-" + pages : null }), { headers: { "content-type": "application/json" } }); } };
    assert.equal((await DIP.getQueueDocuments(profile, leaseBounds)).length, 3);
    assert.equal(pages, 3); assert.equal(intervalStarts, 1); assert.equal(intervalStops, 1); assert.equal(renewals, 3);
    clock += 3600000;
    await assert.rejects(DIP.getQueueDocuments(profile, { ...leaseBounds, deadlineMs: clock + 60000,
      klassen: { erneuere: async () => ({ erneuert: false }) },
      fetch: async (_url, opts) => { await tick(); assert.equal(opts.signal.aborted, true); throw Error("sensitive"); }
    }), error => error.message === "dip-lease-verloren" && error.anbieterVertagung?.grund === "klassen-lease-verloren");
    const deadlineMs = clock + 60000;
    await assert.rejects(DIP.getQueueDocuments(profile, { ...bounds, deadlineMs,
      fetch: async () => { clock = deadlineMs + 1; return new Response(JSON.stringify({ documents: [original], cursor: "pending-next-page" }),
        { headers: { "content-type": "application/json" } }); }
    }), error => error.code === "DIP_TIME_BUDGET");
    clock += 3600000;
    await assert.rejects(DIP.getQueueDocuments(profile, { ...leaseBounds, deadlineMs: clock + 60000,
      klassen: { erneuere: async () => ({ erneuert: false }) },
      anbieterDeps: { ...leaseBounds.anbieterDeps, melde: async () => { await tick(); return { verfuegbar: true }; } },
      fetch: async () => new Response(JSON.stringify({ documents: [original] }), { headers: { "content-type": "application/json" } })
    }), error => error.anbieterVertagung?.grund === "klassen-lease-verloren");
    // Der letzte Seitenfehler darf den neuen Bestand nicht als Cache freigeben.
    let freshRequests = 0;
    await assert.rejects(DIP.getQueueDocuments(profile, { ...bounds, deadlineMs: clock + 5,
      fetch: async (_url, opts) => { freshRequests++; return new Promise((_resolve, reject) =>
        opts.signal.addEventListener("abort", () => reject(new Error("sensitive")), { once: true })); }
    }), error => error.code === "DIP_TIME_BUDGET");
    assert.equal(freshRequests, 1);
  });
  console.log(`${count}/${count} Queue-Inhaltsversorgung PASS`);
})().catch(error => { console.error(error); process.exitCode = 1; });
