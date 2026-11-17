"use strict";
const assert = require("node:assert/strict");
const { ergaenze } = require("../lib/helmut/quellen-operatorplanung");
const { PARLAMENTSDATEN_QUELLEN, BMG_SOURCE_ID } = require("../lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen");
const FEED = PARLAMENTSDATEN_QUELLEN.find(s => s.id === BMG_SOURCE_ID);
const ZEIT = Date.parse("2026-11-17T09:30:00Z"), ID = "00000000-0000-4000-8000-000000000001";
const clone = value => structuredClone(value);
const persistenzJson = value => JSON.parse(JSON.stringify(value));
let pass = 0;
async function check(name, fn) { await fn(); console.log("PASS " + name); pass++; }
function welt() {
  let zeit = ZEIT;
  const w = { geladen: 0, reads: 0, keyReads: 0, writes: 0, jobs: [], auftrag: null };
  w.input = {
    rows: {
      publishers: [{ id: "publisher-bundesgesundheitsministerium.de", canonical_domain: "bundesgesundheitsministerium.de",
        lifecycle_status: "active", publisher_type: "ministry", evidence_role: "official_primary", trust: "hoch" }],
      retrievalPaths: [{ id: "rp-bmg-meldungen-rss", legacy_source_id: BMG_SOURCE_ID,
        publisher_id: "publisher-bundesgesundheitsministerium.de", name: FEED.name, method: "rss", url: FEED.url,
        query: null, parser: "rss-regex", activation_mode: "auto", status: "needs_review", priority: 80, max_items: 12, is_critical: false }],
      packages: [{ id: "pkg-arbeit-und-soziales", key: "arbeit-und-soziales", status: "active" }],
      packagePaths: [{ package_id: "pkg-arbeit-und-soziales", retrieval_path_id: "rp-bmg-meldungen-rss" }]
    },
    profile: [{ id: "synthetisches-mandat", fullName: "Testmandat", party: "Fraktionslos", parliamentType: "Bundestag",
      constituency: "Testwahlkreis", committees: ["Arbeit und Soziales"], profileActive: true }],
    legacySources: []
  };
  w.row = auftrag => ({ id: ID, job_type: auftrag.jobType, idempotency_key: auftrag.idempotencyKey,
    freshness_window: auftrag.freshnessWindow, tenant_id: auftrag.tenantId, status: "wartend", attempts: 0,
    priority: auftrag.priority, max_attempts: auftrag.maxAttempts, first_due_at: auftrag.dueAt,
    due_at: auftrag.dueAt, payload: persistenzJson(auftrag.payload) });
  w.deps = {
    env: { HELMUT_SOURCE_MODE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SUPABASE_TIMEOUT_MS: "10000" },
    now: () => zeit,
    lade: async () => { w.geladen++; return clone(w.input); },
    request: async (url, options) => {
      if (url.includes("tenant_id=not.is.null")) {
        w.keyReads++;
        assert.match(decodeURIComponent(url), /^\/rest\/v1\/helmut_jobs\?select=id&tenant_id=not.is.null&idempotency_key=eq.source_fetch\|geteilt\|[a-f0-9]+\|2026-11-17T00Z&limit=1$/);
        return w.foreignKey ? [{ id: ID }] : [];
      }
      w.reads++;
      assert.ok(url.startsWith("/rest/v1/helmut_jobs?select=id,"));
      assert.ok(!url.includes("select=*"));
      assert.match(url, /&tenant_id=is.null&/);
      assert.match(decodeURIComponent(url), /or=\(idempotency_key.eq.source_fetch\|geteilt\|[a-f0-9]+\|2026-11-17T00Z,and\(job_type.eq.source_fetch,freshness_window.like.2026-11-17\*/);
      assert.match(decodeURI(url), /payload->quelle->>id.eq.bmg-meldungen-rss/);
      assert.match(url, /&limit=2$/); assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 2000);
      assert.equal(options.method, undefined);
      return clone(w.jobs);
    },
    enqueue: async auftrag => {
      w.writes++; w.auftrag = clone(auftrag); w.jobs = [w.row(auftrag)];
      return { verfuegbar: true, neu: true, id: ID };
    }
  };
  w.weiter = ms => { zeit += ms; };
  w.run = extra => ergaenze({ jetztMs: ZEIT, deadlineMs: ZEIT + 20000, deps: w.deps, ...extra });
  return w;
}
async function main() {
  await check("aktiver relationaler AS-Bedarf erzeugt genau den unveraenderten heutigen Compilerauftrag", async () => {
    const w = welt(), vorher = clone(w.input);
    assert.deepEqual(await w.run(), { ok: true, neu: 1, auftragId: ID });
    assert.equal(w.writes, 1); assert.equal(w.reads, 2); assert.deepEqual(w.input, vorher);
    assert.equal(w.auftrag.jobType, "source_fetch"); assert.equal(w.auftrag.priority, 100);
    assert.equal(w.auftrag.freshnessWindow, "2026-11-17T00Z"); assert.equal(w.auftrag.tenantId, null);
    assert.match(w.auftrag.idempotencyKey, /^source_fetch\|geteilt\|[a-f0-9]+\|2026-11-17T00Z$/);
    assert.ok(Date.parse(w.auftrag.dueAt) >= Date.parse("2026-11-17T03:00:00Z"));
    assert.ok(Date.parse(w.auftrag.dueAt) < Date.parse("2026-11-17T03:30:00Z"));
    assert.equal(w.auftrag.payload.quelle.id, BMG_SOURCE_ID);
    assert.deepEqual(w.auftrag.payload.quelle.rssUrls, [FEED.url]);
    assert.equal(w.auftrag.payload.quelle.maxItems, 12);
    assert.equal(w.auftrag.payload.quelle.usagePolicy, undefined);
    assert.equal(Object.hasOwn(w.auftrag.payload.quelle, "category"), true);
    assert.equal(w.auftrag.payload.quelle.category, undefined);
    assert.equal(Object.hasOwn(w.jobs[0].payload.quelle, "category"), false, "JSON-Persistenz laesst undefined weg");
    assert.equal(w.jobs[0].status, "wartend"); assert.equal(w.jobs[0].attempts, 0);
    const gespeichert = clone(w.jobs);
    assert.deepEqual(await w.run(), { ok: true, neu: 0, auftragId: ID });
    assert.equal(w.writes, 1); assert.deepEqual(w.jobs, gespeichert);
  });
  await check("mehrere echte Bedarfstraeger bleiben ein geteilter Auftrag ohne Profilhartkodierung", async () => {
    const w = welt(); w.input.profile.push({ ...w.input.profile[0], id: "zweites-testmandat" });
    await w.run(); assert.equal(w.writes, 1); assert.equal(w.auftrag.payload.angefordertVon, 2);
  });
  await check("Defaultloader nutzt relationale Autoritaet und bekannte Feeddefinition ohne Mainblob", async () => {
    const w = welt(), store = require("../lib/helmut/storage");
    const original = { listSourceArchitectureRows: store.listSourceArchitectureRows,
      listFullProfiles: store.listFullProfiles, getSources: store.getSources };
    let katalogReads = 0, profilReads = 0;
    store.listSourceArchitectureRows = async () => { katalogReads++; return clone(w.input.rows); };
    store.listFullProfiles = async () => { profilReads++; return clone(w.input.profile); };
    store.getSources = () => assert.fail("Mainblob darf nicht geladen werden");
    delete w.deps.lade;
    try {
      assert.equal((await w.run()).neu, 1); assert.equal(katalogReads, 1); assert.equal(profilReads, 1);
      assert.equal(w.auftrag.payload.quelle.type, "official");
    } finally { Object.assign(store, original); }
  });
  await check("bestehende Erfolge, Fehler und laufende Auftraege werden niemals neu eingereiht oder befoerdert", async () => {
    for (const status of ["wartend", "laeuft", "erledigt", "fehlgeschlagen"]) {
      const w = welt(); await w.run(); w.jobs[0].status = status;
      w.jobs[0].due_at = "2026-11-17T12:00:00Z";
      const before = clone(w.jobs); w.writes = 0;
      assert.equal((await w.run()).neu, 0); assert.equal(w.writes, 0); assert.deepEqual(w.jobs, before);
    }
  });
  await check("inaktive oder unberechtigte Katalog-/Paket-/Profilzustaende stoppen vor Queue-IO", async () => {
    const edits = [i => i.rows.packages[0].status = "prepared", i => i.profile[0].profileActive = false,
      i => i.profile[0].committees = ["Finanzen"], i => i.rows.packagePaths = [],
      i => i.rows.retrievalPaths[0].activation_mode = "manual", i => i.rows.retrievalPaths[0].status = "broken",
      i => i.rows.publishers[0].lifecycle_status = "paused", i => i.profile = []];
    for (const edit of edits) { const w = welt(); edit(w.input); await assert.rejects(w.run(), /operator-planung-/);
      assert.equal(w.writes, 0); assert.equal(w.reads, 0); }
  });
  await check("abweichende Feed-, Herausgeber-, Parser- oder Quellenidentitaet wird nicht repariert oder abgerufen", async () => {
    const edits = [i => i.rows.retrievalPaths[0].url += "?anders=1", i => i.rows.retrievalPaths[0].max_items = 50,
      i => i.rows.retrievalPaths[0].publisher_id = "fremd", i => i.rows.retrievalPaths[0].parser = "html",
      i => i.rows.retrievalPaths.push({ ...i.rows.retrievalPaths[0], id: "zweite-identitaet" }),
      i => i.legacySources.push({ ...FEED, rssUrl: "https://example.invalid/fremd", maxItems: 12 })];
    for (const edit of edits) { const w = welt(); edit(w.input); await assert.rejects(w.run(), /operator-planung-/);
      assert.equal(w.writes, 0); assert.equal(w.reads, 0); }
  });
  await check("doppelter, manipulierter oder anderer heutiger Auftrag bleibt gesperrt", async () => {
    for (const edit of [w => w.jobs.push(clone(w.jobs[0])), w => w.jobs[0].payload.quelle.rssUrls.push("https://example.invalid"),
      w => w.jobs[0].freshness_window = "2026-11-17T08Z", w => w.jobs[0].tenant_id = "fremdes-mandat",
      w => w.jobs[0].priority = 80, w => w.jobs[0].payload.quelle.maxItems = 500,
      w => w.jobs[0].payload.quelle.category = null,
      w => { w.jobs[0].freshness_window = "2026-11-16T00Z"; w.jobs[0].last_seen_window = "2026-11-16T00Z"; },
      w => w.jobs[0].job_type = "document_understanding",
      w => w.jobs[0].first_due_at = "2026-11-17T02:59:59Z",
      w => w.jobs[0].due_at = "ungueltiger-termin",
      w => w.jobs[0].due_at = "2026-11-17T02:00:00Z"]) {
      const w = welt(); await w.run(); edit(w); w.writes = 0;
      await assert.rejects(w.run(), /operator-planung-bestand-/); assert.equal(w.writes, 0);
    }
    const w = welt(); w.foreignKey = true;
    await assert.rejects(w.run(), /key-nicht-global/); assert.equal(w.keyReads, 1);
    assert.equal(w.reads, 0); assert.equal(w.writes, 0);
  });
  await check("UNKNOWN-Einreihung bleibt ohne Wiederholung gesperrt selbst wenn die Zeile schon existiert", async () => {
    for (const answer of [undefined, { verfuegbar: false }, { verfuegbar: true, neu: true, id: "ungueltig" }]) {
      const w = welt(), original = w.deps.enqueue;
      w.deps.enqueue = async auftrag => { await original(auftrag); return answer; };
      await assert.rejects(w.run(), /einreihung-unknown/); assert.equal(w.writes, 1); assert.equal(w.reads, 1);
    }
    const w = welt(); w.deps.enqueue = async () => { w.writes++; throw Error("lost"); };
    await assert.rejects(w.run(), /einreihung-unknown/); assert.equal(w.writes, 1);
  });
  await check("bekannte Antwort braucht exakten dauerhaften Readback, Konfliktrennen schreibt nicht um", async () => {
    for (const mutate of [w => w.jobs = [], w => w.jobs[0].id = "00000000-0000-4000-8000-000000000002",
      w => w.jobs[0].payload.quelle.url = "https://example.invalid/"]) {
      const w = welt(), original = w.deps.enqueue;
      w.deps.enqueue = async a => { const answer = await original(a); mutate(w); return answer; };
      await assert.rejects(w.run(), /operator-planung-(readback|bestand)/); assert.equal(w.writes, 1);
    }
    const w = welt(), original = w.deps.enqueue;
    w.deps.enqueue = async a => ({ ...await original(a), neu: false });
    assert.deepEqual(await w.run(), { ok: true, neu: 0, auftragId: ID }); assert.equal(w.writes, 1);
  });
  await check("Frist vor IO, nach Lesen und vor Schreiben bleibt verbindlich; kein Hintergrundretry", async () => {
    let w = welt(); await assert.rejects(w.run({ deadlineMs: ZEIT }), /zeit-abweichend/); assert.equal(w.geladen, 0);
    w = welt(); const load = w.deps.lade; w.deps.lade = async () => { const i = await load(); w.weiter(9000); return i; };
    await assert.rejects(w.run(), /zeitbudget/); assert.equal(w.writes, 0);
    w = welt(); const enqueue = w.deps.enqueue;
    w.deps.enqueue = async a => { const r = await enqueue(a); w.weiter(21000); return r; };
    await assert.rejects(w.run(), /zeitbudget/); assert.equal(w.writes, 1); assert.equal(w.reads, 1);
  });
  await check("Tag, Startzeit, Obergrenze und aktive Betriebsflags werden nicht aus blanket GO abgeleitet", async () => {
    const w = welt();
    for (const extra of [{ jetztMs: Date.parse("2026-11-18T09:30:00Z") }, { jetztMs: Date.parse("2026-11-17T09:00:00Z") },
      { deadlineMs: ZEIT + 300001 }, { jetztMs: ZEIT + 1 }]) await assert.rejects(w.run(extra), /zeit-abweichend/);
    for (const flag of ["HELMUT_SOURCE_MODE", "HELMUT_QUELLEN_ARBEITSFENSTER"]) {
      const x = welt(); x.deps.env[flag] = "off"; await assert.rejects(x.run(), /modus-aus/); assert.equal(x.geladen, 0);
    }
    assert.equal(w.geladen, 0);
  });
  console.log(`${pass}/${pass} Gruppen PASS`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
