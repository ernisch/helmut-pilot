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
  await test("Bestätigter leerer RSS-Feed erzeugt weder zweiten Abruf noch Meldung", async () => {
    const url = "https://nachrichten.fixture.invalid/feeds/9.xml";
    const abrufe = [];
    const lauf = await crawlAllSources([{ id: "mess-feed", url, rssUrl: url, crawlMethod: "rss", active: true }], {
      fetchUrl: async adresse => {
        abrufe.push(adresse);
        return { status: 200, finalUrl: adresse, body: "<rss><channel></channel></rss>" };
      }
    });
    A.deepEqual(abrufe, [url]);
    A.equal(lauf.results[0].status, "empty");
    A.deepEqual(lauf.rawItems, []);
  });
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
        leseQuellenprofil: async () => ({ ...profile, profileActive: false }) }
    ]) {
      const ausgang = await P.HANDLER.source_fetch(job, { ...variante, env, now: () => jetzt,
        crawlAllSources: async () => A.fail("gesperrter Altauftrag") }, { auftragsDeadlineMs: jetzt + 120000 });
      A.equal(ausgang.zurueckgestellt, true);
      A.equal(ausgang.bundestagAbrufpauseMs, 86400000);
    }
  });
  await test("Bestätigter alter Google-Feed läuft ohne überholten HTML-Ersatz weiter", async () => {
    const feed = "https://news.google.com/rss/search?q=fixture";
    const alt = { id: "fixture-google", retrievalPathId: "rp-fixture-google", type: "media", crawlMethod: "rss",
      url: "https://news.google.com/search?q=fixture", rssUrl: feed, active: true };
    const job = { id: "fixture-alt", tenantId: null, firstDueAt: "2026-11-18T03:00:00Z",
      payload: { art: "geteilt", quelle: alt } };
    const neu = { ...alt, url: feed };
    const abrufe = [];
    const deps = { env, now: () => jetzt, hardeningConfig: () => ({ enabled: false }),
      leseHeutigenQuellenplan: async () => ({ auftraege: [{ jobType: "source_fetch", tenantId: null,
        payload: { art: "geteilt", quelle: neu } }] }),
      crawlAllSources: (sources, opts) => crawlAllSources(sources, { ...opts, fetchUrl: async url => {
        abrufe.push(url); return { body: "<rss><channel></channel></rss>" };
      } }) };
    const lauf = () => P.HANDLER.source_fetch(job, deps, { auftragsDeadlineMs: jetzt + 120000 });
    A.equal((await lauf()).abrufErgebnis.art, "keine-funde");
    A.deepEqual(abrufe, [feed]);
    A.equal(job.payload.quelle.url, alt.url);
    neu.url = neu.rssUrl = `${feed}-anders`;
    A.equal((await lauf()).grund, "quellenbedarf-nicht-mehr-bestaetigt");
    A.deepEqual(abrufe, [feed]);
    const fehlerAbrufe = [];
    const fehler = await crawlAllSources([{ ...alt, url: feed }], { fetchUrl: async url => {
      fehlerAbrufe.push(url); throw Error("Fixture-Abruffehler");
    } });
    A.equal(fehler.results[0].ok, false);
    A.deepEqual(fehlerAbrufe, [feed]);
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
  await test("Personenauftrag prüft den richtigen Profilbezug vor der Artikelsuche", async () => {
    const S = require("../lib/helmut/scheduler");
    const D = require("../lib/helmut/source-demand");
    const eigen = { ...profile, fullName: "Mara Beispiel" };
    const plan = await D.kompiliereQuellenbedarf({ profile: [eigen], env, jetztMs: jetzt,
      quellenFuerProfil: async p => [S.personNewsSource(p)] });
    const geplant = plan.auftraege.find(j => j.payload.art === "person-aktuell");
    A(!Object.hasOwn(geplant.payload.quelle, "queryTerms"));
    const job = { id, tenant_id: eigen.id, job_type: "source_fetch", attempts: 1, first_due_at: due, payload: geplant.payload };
    const url = "https://fixture.example/politik/mandat", feed = geplant.payload.quelle.rssUrl;
    const fremd = "https://news.google.com/rss/articles/CBMi_fixture-andere-person";
    const body = `<rss><channel><item><title>Mara Beispiel zur Infrastruktur</title><description>Ein Bericht</description>`
      + `<pubDate>Thu, 12 Nov 2026 10:00:00 GMT</pubDate><link>${url}</link></item>`
      + `<item><title>Andere Person zur Infrastruktur</title><description>Ein anderer Bericht</description>`
      + `<pubDate>Thu, 12 Nov 2026 10:00:00 GMT</pubDate><link>${fremd}</link></item></channel></rss>`;
    const abrufe = [], gespeichert = [];
    const deps = { env, now: () => jetzt, klassen: {}, handler: P.HANDLER, googleOriginale: new Map(),
      leseQuellenprofil: async mandatsId => { A.equal(mandatsId, eigen.id); return eigen; },
      hardeningConfig: () => ({ enabled: false }), quellenbelegSpeicher: () => ({
        sichern: async (_auftrag, beleg) => { A.equal(beleg.art, "rohfassungen"); } }),
      crawlAllSources: (sources, opts) => crawlAllSources(sources, { ...opts, fetchUrl: async adresse => {
        abrufe.push(adresse); return { body: adresse === feed ? body : "" };
      } }),
      persistRohdokumente: async items => {
        gespeichert.push(...items.map(item => item.url)); return { ok: true, bestaetigteIds: ["rd-" + "a".repeat(64)] };
      },
      finish: async r => { A.equal(r.ok, true); return { verfuegbar: true, uebernommen: true }; },
      zurueckstellen: async r => { A.equal(r.delayMs, 86400000); return { verfuegbar: true }; } };
    A.equal((await P.fuehreAuftragAus({ auftrag: job, deps })).ausgang, "erledigt");
    A.deepEqual(gespeichert, [url]);
    A.deepEqual(abrufe, [feed, url]);
    for (const profil of [null, { ...eigen, id: "anderes-mandat" }, { ...eigen, profileActive: false }]) {
      const abgewiesen = await P.fuehreAuftragAus({ auftrag: job, deps: { ...deps, leseQuellenprofil: async () => profil } });
      A.equal(abgewiesen.grund, "quellenmandat-nicht-mehr-aktiv");
    }
    const archiv = { ...job, payload: { ...job.payload, art: "person-archiv" } };
    A.equal((await P.fuehreAuftragAus({ auftrag: archiv, deps })).grund, "personensuche-nicht-mehr-bestaetigt");
    A.deepEqual(abrufe, [feed, url]);
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
    const beleg = { source_id: source.id, retrieval_path_id: source.retrievalPathId, original_url: proxy, found_at: "2026-11-18T17:00:00Z",
      raw_documents: { title, url: original, published_at: new Date(published).toISOString(), link_type: "direct" } };
    async function run(fundstellen, quelle = source, ziel = original) {
      const abrufe = [];
      let lesungen = 0;
      const r = await crawlAllSources([quelle], { now: () => jetzt, deadlineMs: jetzt + 1500,
        googleOriginale: new Map(),
        fetchUrl: async url => { abrufe.push(url); return url === feed ? { body } : { finalUrl: ziel, body: "" }; },
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
      [{ ...beleg, retrieval_path_id: null }],
      [{ ...beleg, found_at: "2026-11-10T17:00:00Z" }], [{ ...beleg, raw_documents: { ...beleg.raw_documents, title: "Andere Fassung" } }],
      [beleg, { ...beleg, raw_documents: { ...beleg.raw_documents, url: `${publisher}politik/anders` } }]]) {
      const neu = await run(schlechte);
      A.deepEqual(neu.abrufe, [feed, proxy]); A.equal(neu.result.gespeicherteGoogleLinks, undefined);
    }
    const person = { ...source, type: "person", queryTerms: ["Haushalt"] };
    A.equal((await run([beleg], person)).lesungen, 0);
    const ohneOriginal = await run([beleg], person, proxy);
    A.deepEqual(ohneOriginal.abrufe, [feed, proxy]);
    A.equal(ohneOriginal.result.items[0].url, "");
    A.equal(ohneOriginal.result.items[0].originalUrl, proxy);
    const ohneBezug = await run([], { ...source, type: "person", queryTerms: ["Fiktiver Fremdname"] });
    A.deepEqual(ohneBezug.abrufe, [feed]); A.equal(ohneBezug.result.itemCount, 0);
    let posts = 0;
    await resolveArticleUrl(proxy, title, {
      fetchUrl: async () => ({ body: '<div data-n-a-id="ABC" data-n-a-ts="123" data-n-a-sg="SIG"></div>' }),
      postForm: async () => { posts++; return { body: "[]" }; }
    });
    A.equal(posts, 1);
  });
  await test("Lange Google-Fundstellenlisten bleiben vollständig und an den Abrufweg gebunden", async () => {
    const { leseGoogleArtikelfundstellen } = require("../lib/helmut/storage");
    const quelle = { id: "fixture", retrievalPathId: "rp-fixture", type: "media" };
    const urls = Array.from({ length: 12 }, (_, i) => `https://news.google.com/rss/articles/${"a".repeat(365)}_${i}?oc=5`);
    const werte = { HELMUT_V3_STORE: "1", SUPABASE_URL: "https://datenbank.fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" };
    const vorher = Object.fromEntries(Object.keys(werte).map(key => [key, process.env[key]]));
    const fetchVorher = globalThis.fetch;
    const abrufe = [];
    let falscheBindung = false;
    try {
      Object.assign(process.env, werte);
      globalThis.fetch = async input => {
        const url = new URL(input);
        const gruppe = url.searchParams.get("original_url").slice(4, -1).split(",").map(JSON.parse);
        abrufe.push({ url, gruppe });
        return Response.json(gruppe.map(original_url => ({ original_url, source_id: quelle.id,
          retrieval_path_id: falscheBindung && original_url === urls[0] ? "rp-fremd" : quelle.retrievalPathId })));
      };
      const lesen = q => leseGoogleArtikelfundstellen(q, [...urls, urls[0], "https://fremd.fixture.invalid/a"], { jetztMs: jetzt, timeoutMs: 600 });
      A.deepEqual((await lesen(quelle)).map(row => row.original_url), urls);
      A.equal(abrufe.length, 2);
      A.deepEqual(abrufe.flatMap(a => a.gruppe), urls);
      for (const { url } of abrufe) {
        A.equal(url.hostname, "datenbank.fixture.invalid");
        A.equal(url.searchParams.get("source_id"), "eq.fixture");
        A.equal(url.searchParams.get("retrieval_path_id"), "eq.rp-fixture");
      }
      const letzterBlock = abrufe[1].gruppe;
      falscheBindung = true;
      A.deepEqual((await lesen(quelle)).map(row => row.original_url), letzterBlock);
      A.deepEqual(await lesen({ ...quelle, type: "person" }), []);
      A.equal(abrufe.length, 4);
    } finally {
      globalThis.fetch = fetchVorher;
      for (const [key, value] of Object.entries(vorher)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  await test("Bestätigte Rohfassung einmal lesen und neue Fassung nach Schreibantwort belegen", async () => {
    const { erzeuge, standHash } = require("../lib/helmut/roh-quellenstaende");
    const operationen = [], stand = new Map();
    const speicher = erzeuge({ storeId: "fixture", request: async (pfad, optionen) => {
      if (optionen?.method === "POST") {
        operationen.push("POST");
        const zeile = JSON.parse(optionen.body);
        stand.set(zeile.id, zeile);
        throw Error("Schreibantwort verloren");
      }
      operationen.push("GET");
      const id = new URL(pfad, "http://localhost").searchParams.get("id").slice(3);
      return stand.has(id) ? [stand.get(id)] : [];
    } });
    const artikel = { id: "rd-" + "a".repeat(64), url: "https://verlag.fixture.invalid/a", title: "Beratung", summary: "Erste Fassung" };
    const hash = await speicher.sichern(artikel);
    A.equal(hash, standHash(artikel));
    A.deepEqual(operationen.splice(0), ["GET", "POST", "GET"]);
    A.equal(await speicher.sichern({ ...artikel, retrieved_at: "2026-11-20T03:00:00Z" }), hash);
    A.deepEqual(operationen.splice(0), ["GET"]);
    const geaendert = { ...artikel, summary: "Zweite Fassung" };
    const neuerHash = await speicher.sichern(geaendert);
    A.notEqual(neuerHash, hash);
    A.deepEqual(operationen, ["GET", "POST", "GET"]);
    A.deepEqual(await speicher.lesen(artikel.id, hash), artikel);
    A.deepEqual(await speicher.lesen(artikel.id, neuerHash), geaendert);
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
    const schluessel = `2026-11-20|${profile.id}`;
    const paket = { user_id: profile.id, generated_at: "2026-11-20T05:14:00Z",
      payload: { briefing: { currentHelmutState: { primaryItem: { sourceIds: [dokument] } } } } };
    const ausgaben = new Map([[schluessel, paket]]);
    const analyseJob = { id: jobId, status: "erledigt", finished_at: "2026-11-20T03:20:00Z",
      payload: { quellenstaende: { [dokument]: stand } } };
    const basis = { catalog: { retrievalPaths: [], packages: [], packagePaths: [] }, profiles: [profile],
      manifest: null, jobs: [job], belege: new Map([[id, beleg]]), analyseJobs: [analyseJob],
      ausgaben, jetztMs: Date.parse("2026-11-20T06:00:00Z"), env };
    const r = C.abgleichen(basis);
    A.equal(r.faelligkeiten[0].produkt, "mandatspaket_belegt");
    A.equal(r.faelligkeiten[0].grund, "frist_verfehlt");
    A.equal(r.faelligkeiten[0].verspaetet, true);
    const nurRohdaten = { ...paket, payload: { briefing: { currentRadarState: {
      articles: [{ documentId: dokument }], anzeige: { articles: [] } } } } };
    A.equal(C.abgleichen({ ...basis, ausgaben: new Map([[schluessel, nurRohdaten]]) }).faelligkeiten[0].grund,
      "zuordnung_nicht_belegt");
    nurRohdaten.payload.briefing.currentRadarState.anzeige.mentions = [{ documentId: dokument }];
    A.equal(C.abgleichen({ ...basis, ausgaben: new Map([[schluessel, nurRohdaten]]) }).faelligkeiten[0].produkt,
      "mandatspaket_belegt");
    A.equal(C.abgleichen({ ...basis, analyseJobs: [{ ...analyseJob, finished_at: "2026-11-20T05:15:01Z" }] })
      .faelligkeiten[0].grund, "analyse_nach_ausgabe");
    A.equal(C.abgleichen({ ...basis, analyseJobs: [{ ...analyseJob, finished_at: null }] })
      .faelligkeiten[0].grund, "analyse_nicht_belegt");
    const weiteres = "rd-" + "b".repeat(64), weitererJob = "00000000-0000-4000-8000-000000000003";
    const { ergebnis } = beleg;
    const teilbeleg = await QStore.sichern({ id, tenantId: profile.id, firstDueAt: due, payload: job.payload },
      { ...ergebnis, rohIds: [...ergebnis.rohIds, weiteres], analyse: [...ergebnis.analyse, { rohId: weiteres, stand, jobId: weitererJob }] },
      Date.parse("2026-11-20T03:10:00Z"));
    const luecke = C.abgleichen({ ...basis, belege: new Map([[id, teilbeleg]]),
      analyseJobs: [...basis.analyseJobs, { ...analyseJob, id: weitererJob, payload: { quellenstaende: { [weiteres]: stand } } }] });
    A.equal(luecke.faelligkeiten[0].grund, "zuordnung_nicht_belegt");
  });
  await test("Eine analysierte amtliche Pflichtquelle belegt auch die Lage erst nach Analyseabschluss", async () => {
    const rohId = "rd-" + "c".repeat(64), stand = "d".repeat(64);
    const jobId = "00000000-0000-4000-8000-000000000004";
    const job = { id, idempotency_key: "dip-pflicht", tenant_id: null, first_due_at: due, due_at: due,
      freshness_window: "2026-11-19T00Z", priority: 35, status: "erledigt", finished_at: "2026-11-19T04:33:00Z",
      payload: { art: "dip-geteilt", quelle: { id: "dip", retrievalPathId: "rp-dip", crawlMethod: "dip" } } };
    const qs = Q.speicher({ storeId: "fixture", request: async (_path, o) => [JSON.parse(o.body)] });
    const beleg = await qs.sichern({ id, tenantId: null, firstDueAt: due, payload: job.payload },
      { art: "rohfassungen", rohIds: [rohId], analyse: [{ rohId, stand, jobId }] },
      Date.parse("2026-11-19T04:31:00Z"));
    const key = `2026-11-19|${profile.id}`;
    const sichtbarerBezug = { documentId: rohId };
    const paket = { user_id: profile.id, generated_at: "2026-11-19T05:10:00Z",
      payload: { briefing: { currentHelmutState: { primaryItem: sichtbarerBezug } } } };
    const basis = { catalog: { retrievalPaths: [], packages: [], packagePaths: [] }, profiles: [profile],
      manifest: null, jobs: [job], belege: new Map([[id, beleg]]), ausgaben: new Map([[key, paket]]),
      analyseJobs: [{ id: jobId, status: "erledigt", finished_at: "2026-11-19T04:40:00Z",
        payload: { quellenstaende: { [rohId]: stand } } }], jetztMs: Date.parse("2026-11-19T06:00:00Z"), env };
    function pruefeLage(generated_at) {
      return C.abgleichen({ ...basis, lageAusgaben: new Map([[key, { user_id: profile.id, generated_at,
        payload: { paragraphs: [sichtbarerBezug] } }]]) }).faelligkeiten[0];
    }
    A.equal(pruefeLage("2026-11-19T04:39:59Z").grund, "lagefrist_nicht_belegt");
    A.equal(pruefeLage("2026-11-19T04:40:01Z").grund, null);
    A.equal(pruefeLage("2026-11-19T05:00:01Z").grund, "lage_verspaetet");
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
