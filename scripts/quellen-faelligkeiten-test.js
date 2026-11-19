"use strict";

const A = require("node:assert/strict");
const Q = require("../lib/helmut/quellen-faelligkeit");
const P = require("../lib/helmut/scalable-pipeline");
const B = require("../lib/helmut/quellen-bundestag-termine");
const C = require("../lib/helmut/quellenarchitektur/faelligkeitsabgleich");
const { resolveArticleUrl, crawlAllSources } = require("../lib/helmut/crawler");
const jetzt = Date.parse("2026-11-19T03:30:00Z");
const env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on",
  HELMUT_JOB_DISPATCH_MODE: "off", DIP_API_KEY: "fixture" };
const profile = { id: "fixture-bund", name: "Testmandat Bund", party: "Fraktionslos",
  parliamentType: "Bundestag", focusTopics: ["Wirtschaft"], committees: ["Wirtschaft und Energie"] };
const id = "00000000-0000-4000-8000-000000000001", quelle = B.QUELLEN[1];
const due = "2026-11-19T03:00:00Z";
const inhalt = { art: "terminstand", belegHash: "a".repeat(64), standHash: "b".repeat(64) };
let n = 0;
async function test(name, fn) { await fn(); n++; console.log("PASS " + name); }

async function main() {
  await test("Fristen für Morgen, übrige Tagesarbeit und exaktes Archivfenster bleiben erhalten", () => {
    const frist = Q.fristen({ priority: 40 }, due);
    A.deepEqual(frist, { urspruenglichFaelligAm: "2026-11-19T03:00:00.000Z",
      frist: "2026-11-19T05:00:00.000Z", morgenbriefingFrist: "2026-11-19T05:15:00.000Z" });
    A.deepEqual(Q.fristen({ priority: 40, payload: { faelligkeit: frist } }, due, 1), frist);
    A.equal(Q.fristen({ priority: 100 }, due).frist, "2026-11-20T03:00:00.000Z");
    A.equal(Q.fristen({ priority: 300, payload: { art: "person-archiv" }, freshnessWindow: "2026-11-19T00Z" },
      due).frist, "2026-11-26T00:00:00.000Z");
  });
  await test("Persistierter Abruf wird nach abgebrochenem Queue-Abschluss exakt einmal nachgelesen", async () => {
    const rows = new Map();
    const S = Q.speicher({ storeId: "fixture", request: async (path, o) => {
      if (o?.method === "POST") {
        const row = JSON.parse(o.body);
        A(!rows.has(row.id)); rows.set(row.id, row); throw Error("antwort-verloren");
      }
      return [...rows.values()].filter(r => path.includes("id=eq." + r.id + "&"));
    } });
    const job = { id, job_type: "source_fetch", tenant_id: null,
      payload: { quelle: { id: "fixture-direkt", url: "https://quelle.example/feed", active: true } },
      first_due_at: due, max_attempts: 5, attempts: 1 };
    let fetches = 0, finishes = 0;
    const deps = { env, now: () => jetzt, klassen: {}, quellenbelegSpeicher: () => S,
      handler: P.HANDLER, hardeningConfig: () => ({ enabled: false }),
      crawlAllSources: async () => { fetches++; return { results: [{ ok: true, status: "empty", items: [] }] }; },
      finish: async () => (++finishes === 1 ? { verfuegbar: false } : { verfuegbar: true, uebernommen: true }) };
    A.equal((await P.fuehreAuftragAus({ auftrag: job, deps })).ausgang, "nicht-uebernommen");
    A.equal((await P.fuehreAuftragAus({ auftrag: { ...job, attempts: 2 }, deps })).ausgang, "erledigt");
    A.equal(fetches, 1); A.equal(rows.size, 1);
    await A.rejects(S.lesen({ id, tenantId: "fremd", firstDueAt: due, payload: job.payload }), /quellenbeleg-leseantwort/);
  });
  await test("Späte Belegschreibantwort startet nach der Auftragsfrist keinen Rücklesezugriff", async () => {
    let zeit = jetzt, lesungen = 0;
    const S = Q.speicher({ storeId: "fixture", now: () => zeit, deadlineMs: jetzt + 1000,
      request: async (_path, opts) => {
        if (opts?.method === "POST") { zeit += 1000; throw Error("Schreibantwort verspätet"); }
        lesungen++; return [];
      } });
    await A.rejects(S.sichern({ id, tenantId: null, firstDueAt: due, payload: { quelle } }, inhalt, jetzt), /quellenbeleg-zeitbudget/);
    A.equal(lesungen, 0);
  });
  await test("Historisches Jobpayload allein berechtigt weder Abruf noch Übertrag auf ein anderes Profil", async () => {
    const job = { id: "fixture-historisch", tenantId: profile.id, firstDueAt: "2026-11-18T03:00:00Z",
      payload: { quelle: { id: "fixture-aktiv", url: "https://daten.example/alter-fallback",
        rssUrl: "https://daten.example/feed", crawlMethod: "rss" } } };
    for (const variante of [
      { leseHeutigenQuellenplan: async () => ({ auftraege: [{ ...job, jobType: "source_fetch", tenantId: "fremd" }] }) },
      { leseHeutigenQuellenplan: async () => ({ auftraege: [{ ...job, jobType: "source_fetch",
        payload: { quelle: { ...job.payload.quelle, url: "https://daten.example/neuer-fallback" } } }] }) },
      { leseHeutigenQuellenplan: async () => ({ auftraege: [{ ...job, jobType: "source_fetch" }] }),
        getActiveProfile: async () => ({ ...profile, profileActive: false }) }
    ]) {
      const ausgang = await P.HANDLER.source_fetch(job, { ...variante, env, now: () => jetzt,
        crawlAllSources: async () => A.fail("gesperrter Altauftrag") }, { auftragsDeadlineMs: jetzt + 120000 });
      A.equal(ausgang.zurueckgestellt, true);
      A.equal(ausgang.bundestagAbrufpauseMs, 86400000);
    }
  });
  await test("DIP wird einmal gemeinsam geplant und Personensuchen behalten zwei getrennte Mandate", async () => {
    let manifest;
    const zweites = { ...profile, id: "fixture-bund-zwei", name: "Zweites Testmandat" };
    const S = require("../lib/helmut/scheduler");
    await P.planeArbeit({ env, jetztMs: jetzt, deps: { now: () => jetzt,
      listFullProfiles: async () => [profile, zweites],
      quellenFuerProfil: async p => [S.personNewsSource(p)],
      enqueue: async () => ({ verfuegbar: true, neu: true }),
      planungsrest: { lesen: async () => null, sichereManifest: async (_tag, m) => {
        manifest = m.auftraege; return { ...m, cursor: 0, zustand: "offen" };
      }, bewegeCursor: async (_tag, m, cursor) => ({ ...m, cursor, zustand: cursor === m.auftraege.length ? "fertig" : "offen" }) }
    } });
    const [dip, ...doppelte] = manifest.filter(j => j.payload.quelle?.id === "dip");
    A.equal(dip.tenantId, null); A.equal(doppelte.length, 0); A(!Object.hasOwn(dip.payload, "mandatsId"));
    A.deepEqual(new Set(manifest.filter(j => j.payload.art === "person-aktuell").map(j => j.tenantId)),
      new Set([profile.id, zweites.id]));
  });
  await test("Bestätigte Google-Auflösung teilt exakt eine Anfrage; ungeklärte Originale werden nicht zwischengespeichert", async () => {
    const googleOriginale = new Map();
    const google = "https://news.google.com/rss/articles/CBMi_beschreibungsfixture";
    let eingaenge = 0;
    const fetchUrl = async () => { eingaenge++; return { finalUrl: "https://example.org/politik/beleg", body: "" }; };
    A.deepEqual(await Promise.all([1, 2].map(() => resolveArticleUrl(google, "Beleg", { googleOriginale, fetchUrl }))),
      Array(2).fill("https://example.org/politik/beleg"));
    A.equal(eingaenge, 1);
    const unbekannt = async () => { eingaenge++; throw Error("fixture nicht verfügbar"); };
    for (let i = 0; i < 2; i++) A.equal(await resolveArticleUrl(google, "Abweichender Beleg", { googleOriginale, fetchUrl: unbekannt }), google);
    A.equal(eingaenge, 3); A.equal(googleOriginale.size, 1);
  });
  await test("Erneute öffentliche Google-Beobachtung verwendet nur die bestätigte Originaladresse", async () => {
    const feed = "https://news.google.com/rss/search?q=fixture", publisher = "https://fixture.example/";
    const proxy = "https://news.google.com/rss/articles/CBMi_fiktiver_link", original = `${publisher}politik/geprueft`;
    const title = "Fixture zum Haushalt", published = "Wed, 18 Nov 2026 10:00:00 GMT";
    const body = `<rss><channel><item><title>${title}</title><description>Fixture Erläuterung</description>`
      + `<pubDate>${published}</pubDate><link>${proxy}</link><source url="${publisher}">Fixture Zeitung</source></item></channel></rss>`;
    const source = { id: "fixture", retrievalPathId: "rp-fixture", name: "Fixture", type: "media", active: true,
      url: feed, rssUrl: feed, crawlMethod: "rss" };
    const beleg = { source_id: source.id, retrieval_path_id: null, original_url: proxy, found_at: "2026-11-18T17:00:00Z",
      raw_documents: { title, url: original, published_at: new Date(published).toISOString(), link_type: "direct" } };
    async function run(fundstellen, quelle = source) {
      const abrufe = [];
      let lesungen = 0;
      const r = await crawlAllSources([quelle], { now: () => jetzt, deadlineMs: jetzt + 1500,
        googleOriginale: new Map(),
        fetchUrl: async url => { abrufe.push(url); return url === feed ? { body } : { finalUrl: original, body: "" }; },
        leseGoogleArtikelfundstellen: async (_quelle, urls, { timeoutMs }) => {
          A.deepEqual(urls, [proxy]); A.equal(timeoutMs, 600); lesungen++;
          return fundstellen;
        } });
      return { abrufe, lesungen, result: r.results[0] };
    }
    const wieder = await run([beleg]);
    A.deepEqual(wieder.abrufe, [feed]); A.equal(wieder.lesungen, 1);
    A.equal(wieder.result.items[0].url, original); A.equal(wieder.result.items[0].originalUrl, proxy);
    A.equal(wieder.result.gespeicherteGoogleLinks, 1);
    for (const schlechte of [[{ ...beleg, source_id: "fremd" }], [{ ...beleg, retrieval_path_id: "rp-fremd" }],
      [{ ...beleg, found_at: "2026-11-10T17:00:00Z" }], [{ ...beleg, raw_documents: { ...beleg.raw_documents, title: "Andere Fassung" } }],
      [beleg, { ...beleg, raw_documents: { ...beleg.raw_documents, url: `${publisher}politik/anders` } }]]) {
      const neu = await run(schlechte);
      A.deepEqual(neu.abrufe, [feed, proxy]); A.equal(neu.result.gespeicherteGoogleLinks, undefined);
    }
    A.equal((await run([beleg], { ...source, type: "person", queryTerms: ["Haushalt"] })).lesungen, 0);
    const ohneBezug = await run([], { ...source, type: "person", queryTerms: ["Fiktiver Fremdname"] });
    A.deepEqual(ohneBezug.abrufe, [feed]); A.equal(ohneBezug.result.itemCount, 0);
    let posts = 0;
    await resolveArticleUrl(proxy, title, {
      fetchUrl: async () => ({ body: '<div data-n-a-id="ABC" data-n-a-ts="123" data-n-a-sg="SIG"></div>' }),
      postForm: async () => { posts++; return { body: "[]" }; }
    });
    A.equal(posts, 1);
  });
  await test("Abgleich findet fehlenden Katalogweg, verlorenes Enqueue und fremdes oder zu spätes Morgenpaket", async () => {
    const job = { id, idempotency_key: "pflicht", tenant_id: null, first_due_at: due, due_at: due,
      freshness_window: "2026-11-19T00Z", priority: 40, status: "erledigt", finished_at: "2026-11-19T04:33:00Z",
      payload: { art: "geteilt", quelle } };
    const binding = { id, tenantId: null, firstDueAt: due, payload: job.payload };
    const speicher = Q.speicher({ storeId: "fixture", request: async (_path, o) => [JSON.parse(o.body)] });
    const beleg = await speicher.sichern(binding, inhalt, jetzt);
    const planAuftrag = { jobType: "source_fetch", idempotencyKey: "pflicht", tenantId: null,
      freshnessWindow: job.freshness_window, dueAt: due, priority: 40, payload: job.payload };
    const catalog = { retrievalPaths: [{ id: quelle.retrievalPathId, legacy_source_id: quelle.id,
      url: quelle.url, method: quelle.crawlMethod, activation_mode: "always_on", status: "healthy" },
    { id: "rp-fehlt", url: "https://amt.example/feed", method: "rss", activation_mode: "always_on", status: "healthy" }],
    packages: [], packagePaths: [] };
    const proof = { ...inhalt, aktuell: true };
    const basis = { catalog, profiles: [profile], env, jetztMs: Date.parse("2026-11-19T06:00:00Z"),
      manifest: { cursor: 2, auftraege: [planAuftrag,
        { jobType: "source_fetch", idempotencyKey: "verloren", payload: { art: "geteilt" } }] },
      jobs: [job], analyseJobs: [], belege: new Map([[id, beleg]]) };
    const lage = { user_id: profile.id, payload: { amtlicheQuellenbelege: [proof] }, generated_at: "2026-11-19T04:58:00Z" };
    const ausgabe = { user_id: profile.id, payload: { briefing: { currentHelmutState: { tagesAnlass: { belege: [proof] } } } },
      generated_at: "2026-11-19T05:14:00Z" };
    const key = `2026-11-19|${profile.id}`;
    function abgleich(morgen, override) {
      return C.abgleichen({ ...basis, ...override, ausgaben: new Map([[key, morgen]]), lageAusgaben: new Map([[key, lage]]) });
    }
    const richtig = abgleich(ausgabe);
    A(richtig.luecken.some(l => l.wegId === "rp-fehlt" && l.grund === "abrufweg_nicht_eingeplant"));
    A(richtig.luecken.some(l => l.grund === "queue_eintrag_fehlt"));
    A.equal(richtig.faelligkeiten[0].produkt, "mandatspaket_belegt");
    A.equal(abgleich({ ...ausgabe, payload: { lageAnsicht: { parlamentsKontext: { belege: [proof] } } } }).faelligkeiten[0].grund,
      "zuordnung_nicht_belegt");
    A.equal(abgleich(ausgabe, { jetztMs: Date.parse("2026-11-20T06:00:00Z"), manifest: null }).faelligkeiten[0].grund, null);
    A(abgleich(ausgabe, { jobs: [{ ...job, tenant_id: "fremd" }] }).luecken.some(l => l.grund === "queue_auftrag_abweichend"));
    const fristManipuliert = { ...job, payload: { ...job.payload, faelligkeit: {
      urspruenglichFaelligAm: new Date(due).toISOString(), frist: "2026-11-20T05:00:00.000Z" } } };
    A.equal(abgleich(ausgabe, { jobs: [fristManipuliert] }).faelligkeiten[0].grund, "queue_auftrag_abweichend");
    A.equal(abgleich({ ...ausgabe, user_id: "fremd" }).faelligkeiten[0].grund, "zuordnung_nicht_belegt");
    A.equal(abgleich({ ...ausgabe, generated_at: "2026-11-19T05:15:01Z" }).faelligkeiten[0].grund, "morgenpaket_verspaetet");
    basis.belege.clear();
    A.equal(abgleich(ausgabe).faelligkeiten[0].grund, "ergebnisbeleg_fehlt");
  });
  await test("Eine Tagesquelle behält den Mandatsbeleg nach Tageswechsel und die verfehlte 24-Stunden-Frist", async () => {
    const dokument = "rd-" + "e".repeat(64), stand = "f".repeat(64);
    const jobId = "00000000-0000-4000-8000-000000000002";
    const job = { id, idempotency_key: "alt", tenant_id: profile.id, first_due_at: due, due_at: due,
      freshness_window: "2026-11-19T00Z", priority: 100, status: "erledigt", finished_at: "2026-11-20T03:15:00Z",
      payload: { art: "person-aktuell", quelle: { id: "fixture-rss", url: "https://quelle.example/feed" } } };
    const QStore = Q.speicher({ storeId: "fixture", request: async (_path, o) => [JSON.parse(o.body)] });
    const beleg = await QStore.sichern({ id, tenantId: profile.id, firstDueAt: due, payload: job.payload },
      { art: "rohfassungen", rohIds: [dokument], analyse: [{ rohId: dokument, stand, jobId }] },
      Date.parse("2026-11-20T03:10:00Z"));
    const ausgaben = new Map([[`2026-11-20|${profile.id}`, { user_id: profile.id, generated_at: "2026-11-20T05:14:00Z",
      payload: { briefing: { currentHelmutState: { primaryItem: { sourceIds: [dokument] } } } } }]]);
    const r = C.abgleichen({ catalog: { retrievalPaths: [], packages: [], packagePaths: [] }, profiles: [profile],
      manifest: null, jobs: [job], belege: new Map([[id, beleg]]), analyseJobs: [{ id: jobId, status: "erledigt",
        payload: { quellenstaende: { [dokument]: stand } } }], ausgaben, jetztMs: Date.parse("2026-11-20T06:00:00Z"), env });
    A.equal(r.faelligkeiten[0].produkt, "mandatspaket_belegt");
    A.equal(r.faelligkeiten[0].grund, "frist_verfehlt");
    A.equal(r.faelligkeiten[0].verspaetet, true);
  });
  await test("Archivschlüssel behalten die erste exakt belegte Fälligkeit des Siebentagefensters", async () => {
    const start = "2026-11-19T00Z", morgen = "2026-11-20T03:10:00Z";
    const auftrag = { jobType: "source_fetch", idempotencyKey: "archiv", tenantId: profile.id,
      priority: 300, freshnessWindow: start, dueAt: due,
      payload: { art: "person-archiv", quelle: { id: "person", url: "https://fixture.invalid/feed" } } };
    const erstmals = { ...auftrag, payload: { ...auftrag.payload, faelligkeit: Q.fristen(auftrag, due) } };
    const heute = { ...auftrag, dueAt: morgen, payload: { ...auftrag.payload, faelligkeit: Q.fristen(auftrag, morgen) } };
    const job = { id, idempotency_key: "archiv", tenant_id: profile.id, first_due_at: due, due_at: due,
      freshness_window: start, priority: 300, status: "wartend", payload: erstmals.payload };
    const plan = a => ({ cursor: 1, auftraege: [a] });
    const basis = { catalog: { retrievalPaths: [], packages: [], packagePaths: [] }, profiles: [profile],
      belege: new Map(), analyseJobs: [], ausgaben: new Map(), env };
    const pruefe = (j, manifest, archivUrspruenge, zeit) => C.abgleichen({ ...basis,
      jobs: [j], manifest, archivUrspruenge, jetztMs: Date.parse(zeit) }).faelligkeiten[0];
    A.equal(pruefe({ ...job, first_due_at: "2026-11-19T00:01:00Z" }, plan(erstmals), new Map(), due).grund,
      "queue_auftrag_abweichend");
    A.equal(pruefe(job, plan(heute), new Map(), morgen).grund, "queue_auftrag_abweichend");
    const original = pruefe(job, plan(heute), new Map([[auftrag.idempotencyKey, erstmals]]), morgen);
    A.equal(original.grund, "abruf_ausstehend");
    A.equal(original.urspruenglichFaelligAm, "2026-11-19T03:00:00.000Z");
    A.equal(original.frist, "2026-11-26T00:00:00.000Z");

    // Beim Tageswechsel fehlt die Archivposition noch in der Queue. Das neue
    // Manifest kann zuerst eintreffen, ohne die ursprüngliche Fälligkeit zu verdrängen.
    const alterTag = "2026-11-19", neuerTag = "2026-11-20";
    const altPlan = { tag: alterTag, cursor: 0, auftraege: [erstmals], zustand: "offen" };
    const plaene = new Map([[alterTag, altPlan]]), queue = new Map();
    const journal = {
      lesen: async tag => plaene.get(tag) || null,
      offene: async ({ bisTag }) => ({ plaene: [...plaene.values()].filter(p => p.tag <= bisTag && p.zustand === "offen") }),
      sichereManifest: async (tag, daten) => {
        const plan = { ...daten, tag, cursor: 0, zustand: "offen" };
        plaene.set(tag, plan); return plan;
      },
      bewegeCursor: async (tag, plan, cursor) => {
        const naechster = { ...plan, cursor, zustand: cursor === plan.auftraege.length ? "fertig" : "offen" };
        plaene.set(tag, naechster); return naechster;
      }
    };
    const deps = { planungsrest: journal, listFullProfiles: async () => [],
      sourceDemand: { kompiliereQuellenbedarf: async () => ({ auftraege: [heute], statistik: {} }),
        planeMandatsarbeit: () => ({ auftraege: [], fenster: `${neuerTag}T00Z` }) },
      enqueue: async j => {
        const neu = !queue.has(j.idempotencyKey);
        if (neu) queue.set(j.idempotencyKey, j);
        return { verfuegbar: true, neu };
      } };
    const folgetag = { env: { ...env, DIP_API_KEY: "" }, deps, jetztMs: Date.parse(morgen), darfNeuPlanen: true };
    A.equal((await P.setzePlanungFort(folgetag)).ok, true);
    A.deepEqual(queue.get(auftrag.idempotencyKey), erstmals);
    A.equal(plaene.get(alterTag).cursor, 0);
    A.equal(plaene.get(neuerTag).auftraege[0].dueAt, morgen);
    A.equal((await P.setzePlanungFort(folgetag)).altrest.vorhanden, 1);
    A.equal(plaene.get(alterTag).zustand, "fertig");
    A.equal(queue.size, 1);
    const wechsel = "2026-11-26";
    const naherPlan = { tag: wechsel, auftraege: [{ ...heute, idempotencyKey: "archiv-neu",
      freshnessWindow: `${wechsel}T00Z`, dueAt: `${wechsel}T03:00:00Z` }] };
    const urspruenge = await require("../lib/helmut/quellen-planungsrest").leseArchivUrspruenge(naherPlan,
      { lesen: async () => A.fail("Ein neues Archivfenster braucht keinen alten Manifestauftrag") });
    A.equal(urspruenge.size, 0);
  });
  console.log(`${n}/${n} Fälligkeitsgruppen bestanden`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
