"use strict";

// Nur die neue Abrufreserve und ihre Verkettungsgrenzen. Echter Worker,
// vorhandener kleiner Queue-Treiber, virtuelle Zeit; kein SQL-/Lastnachweis,
// Netz, Modell oder Wiederholen bestehender Workergruppen.
const A = require("node:assert/strict"), W = require("../lib/helmut/worker-betrieb"),
  P = require("../lib/helmut/scalable-pipeline"), F = require("../lib/helmut/quellen-arbeitsfenster");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
const ENV = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on",
  HELMUT_SOURCE_MODE: "on", HELMUT_JOB_DISPATCH_MODE: "shadow", HELMUT_QUELLEN_FENSTER_TAG: "8",
  HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16" };
const HEUTE = "2026-11-14T00Z";
function bilanz(extra = {}) {
  return { verfuegbar: true, grund: null, reserviert: 0, erledigt: 0, wiederholt: 0,
    endgueltigFehlgeschlagen: 0, leaseVerloren: 0, nichtUebernommen: 0,
    zurueckgestellt: 0, kurzZurueckgestellt: 0, zurueckstellungNichtVerfuegbar: 0,
    stapelrestZurueckgegeben: 0, stapelrestNichtZurueckgegeben: 0, leerlaufWarten: 0,
    dauerMs: 0, verarbeitet: 0, nachTyp: {}, zurueckstellGruende: {}, ...extra };
}
function welt() {
  let zeit = Date.parse("2026-11-14T03:00:00Z");
  const w = { now: () => zeit, weiter: ms => { zeit += ms; }, trace: [], writes: [], quotas: [], slots: [] };
  w.q = erzeugeSpeicherWarteschlange({ now: w.now });
  w.klassen = { belege: async klasse => { w.slots.push(klasse); return { erlaubt: true, slot: "synthetisch-" + klasse }; },
    gebeFrei: async () => {} };
  w.deps = { now: w.now, klassen: w.klassen, claim: w.q.claim, finish: w.q.finish,
    extendLease: w.q.extendLease, zurueckstellen: w.q.zurueckstellen,
    saveRawItems: async items => { w.writes.push(structuredClone(items)); return items; },
    budget: { reserviere: async () => A.fail("Keine Modellreservierung in dieser Regression") } };
  w.run = ({ env = ENV, ...options } = {}) => F.fuehreAus({ env, deps: {
    now: w.now, klassen: w.klassen, bereitschaft: async () => ({ bereit: true }),
    automatik: async () => ({ erlaubt: true }),
    reserviere: async args => { w.quotas.push(args); return { verfuegbar: true, erlaubt: true }; } },
    arbeit: ({ freigabe }) => W.durchlauf({ env, deps: w.deps, kennung: "synthetischer-quellenanteil",
      arbeitsfenster: freigabe, grenzen: { budgetMs: 290000, parallel: 8, stapel: 200 }, ...options }) });
  return w;
}
async function enqueue(w, typ, extra = {}) {
  return w.q.enqueue({ jobType: typ, priority: typ === "document_understanding" ? 80 : typ === "source_fetch" ? 100 : 200,
    idempotencyKey: typ + "|" + w.q.groesse(), freshnessWindow: HEUTE,
    tenantId: typ === "mandate_projection" ? "synthetisches-mandat" : null,
    payload: {}, ...extra });
}
async function stub(w, fn, options) {
  const original = P.arbeite; P.arbeite = fn;
  try { return await w.run(options); } finally { P.arbeite = original; }
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Heutiger Quellenabruf macht vor einer hoeher priorisierten Understandingmenge Fortschritt", async () => {
    const w = welt(), quelle = await enqueue(w, "source_fetch");
    for (let i = 0; i < 6; i++) await enqueue(w, "document_understanding");
    w.deps.handler = {
      source_fetch: async a => { w.trace.push(a.jobType); w.weiter(1000); return { ok: true }; },
      document_understanding: async a => { w.trace.push(a.jobType); w.weiter(1000); return { ok: true }; }
    };
    const r = await w.run();
    A.equal(w.trace[0], "source_fetch"); A.equal(w.trace.filter(t => t === "document_understanding").length, 6);
    A.equal(w.q.hole(quelle.id).status, "erledigt"); A.equal(r.erledigt, 7);
    A.equal(r.worker, 1); A.equal(r.grenzen.stapel, 1); A.equal(r.bilanzen[0].phasen.length, 3);
  });
  await test("Ohne faelligen heutigen Fetch bekommt Historie oder Zukunft keinen Abrufvorrang", async () => {
    for (const window of ["2026-11-13T00Z", "2026-11-15T00Z", "2026-11-14T04Z"]) {
      const w = welt(), alt = await enqueue(w, "source_fetch", { freshnessWindow: window });
      const future = await enqueue(w, "source_fetch", { dueAt: new Date(w.now() + 600000).toISOString() });
      const u = await enqueue(w, "document_understanding");
      w.deps.handler = { source_fetch: async () => A.fail("Kein alter oder kuenftiger Abruf im Vorrang"),
        document_understanding: async () => { w.weiter(1000); return { ok: true }; } };
      const r = await w.run();
      A.equal(w.q.hole(alt.id).status, "wartend"); A.equal(w.q.hole(alt.id).attempts, 0);
      A.equal(w.q.hole(future.id).attempts, 0); A.equal(w.q.hole(u.id).status, "erledigt");
      A.equal(r.bilanzen[0].phasen[1].zurueckgestellt, 1); A.equal(r.bilanzen[0].verfuegbar, true);
      A.equal(r.bilanzen[0].zurueckstellGruende["abrufanteil-nur-heutige-arbeit"], 1);
    }
  });
  await test("Fehlende oder ungueltige originale Claimfrische bleibt unbekannt und sperrt den Folgemix", async () => {
    for (const metadata of [{ freshness_window: null }, { freshness_window: "2026-11-14" },
      { freshness_window: "2026-02-30T00Z" }, { freshness_window: "2026-11-14T24Z" },
      { last_seen_window: "ungueltig" }]) {
      const w = welt(), quelle = await enqueue(w, "source_fetch"), u = await enqueue(w, "document_understanding");
      Object.assign(w.q.hole(quelle.id), metadata);
      w.deps.handler = { source_fetch: async () => A.fail("Kein Abruf bei unklarer Frische"),
        document_understanding: async () => A.fail("Kein Mix nach unklaerer Claimantwort") };
      const r = await w.run(), b = r.bilanzen[0];
      A.equal(b.verfuegbar, false); A.equal(b.grund, "abrufphase-fenster-nicht-bestaetigt");
      A.equal(b.phasen.length, 2); A.equal(b.reserviert, 1); A.equal(b.nichtUebernommen, 1);
      A.equal(w.q.hole(quelle.id).status, "laeuft"); A.equal(w.q.hole(u.id).attempts, 0);
    }
  });
  await test("Abrufreserve nutzt hoechstens90s und ein Drittel ohne Neustart der Gesamtdeadline", async () => {
    for (const budgetMs of [30000, 135000, 290000]) {
      const w = welt(), calls = [];
      const r = await stub(w, async o => { calls.push(o); w.weiter(o.budgetMs); return bilanz({ dauerMs: o.budgetMs }); },
        { grenzen: { budgetMs } });
      A.equal(calls.length, 3); A.equal(calls[0].budgetMs, Math.min(45000, Math.floor(budgetMs / 5)));
      A.equal(calls[1].budgetMs, Math.min(90000, Math.floor(budgetMs / 3)));
      A.deepEqual(calls[1].types, ["source_fetch"]); A.equal(calls[1].stapel, 1);
      A.equal(calls[2].budgetMs, budgetMs - calls[0].budgetMs - calls[1].budgetMs);
      A(calls[2].budgetMs >= Math.floor(budgetMs * 7 / 15));
      A.equal(calls[0].owner, calls[1].owner); A.equal(calls[1].owner, calls[2].owner);
      A.equal(calls[0].deps.blobSpiegel, calls[2].deps.blobSpiegel);
      A.equal(r.bilanzen[0].dauerMs, budgetMs);
    }
  });
  await test("Typen Quelle-aus kleine Budgets und fehlende Freigabe erweitern keinen Arbeitsweg", async () => {
    for (const options of [{ typen: ["document_understanding"] }, { typen: ["tenant_narrative"], grenzen: { parallel: 1 } },
      { env: { ...ENV, HELMUT_SOURCE_MODE: "off" } }, { grenzen: { budgetMs: 14000 } },
      { typen: ["source_fetch", "document_understanding"] }]) {
      const w = welt(), calls = [];
      await stub(w, async o => { calls.push(o); return bilanz(); }, options);
      if (options.typen?.includes("document_understanding") && options.typen.length === 1
        || options.typen?.includes("tenant_narrative") || options.grenzen) A.equal(calls.length, 1);
      if (options.env) A(calls.every(o => !o.types.includes("source_fetch")));
      if (options.typen?.length === 2) {
        A.equal(calls.length, 2); A.deepEqual(calls[0].types, ["source_fetch"]);
        A.deepEqual(calls[1].types, options.typen);
      }
    }
    const original = P.arbeite, calls = []; P.arbeite = async o => { calls.push(o); return bilanz(); };
    try {
      A.equal((await W.durchlauf({ env: ENV })).grund, "arbeitsfenster-nicht-reserviert"); A.equal(calls.length, 0);
      await W.durchlauf({ env: { ...ENV, HELMUT_QUELLEN_ARBEITSFENSTER: "off" }, grenzen: { parallel: 1 } });
      A.equal(calls.length, 1); A.equal(calls[0].types, null);
    } finally { P.arbeite = original; }
  });
  await test("Unklarer Abrufabschluss Claim Rueckgabe oder Lease bleibt phasenuebergreifend gesperrt", async () => {
    for (const result of [null, undefined, bilanz({ verfuegbar: false }), bilanz({ leaseVerloren: 1 }),
      bilanz({ nichtUebernommen: 1 }), bilanz({ reserviert: 1 }), bilanz({ zurueckstellungNichtVerfuegbar: 1 })]) {
      const w = welt(); let n = 0;
      const r = await stub(w, async () => ++n === 1 ? bilanz() : result);
      A.equal(n, 2); A.equal(r.bilanzen[0].verfuegbar, false); A(r.bilanzen[0].grund);
    }
    for (const antwort of [null, { verfuegbar: false, auftraege: [] }, { verfuegbar: true, auftraege: null }]) {
      const w = welt(), claim = w.deps.claim;
      const u = await enqueue(w, "document_understanding");
      w.deps.claim = o => o.types?.length === 1 && o.types[0] === "source_fetch" ? antwort : claim(o);
      w.deps.handler = { document_understanding: async () => A.fail("Keine Fortsetzung nach unklarer Reservierung") };
      const r = await w.run(); A.equal(r.bilanzen[0].verfuegbar, false); A.equal(w.q.hole(u.id).attempts, 0);
    }
    for (const rueckgabe of [null, { verfuegbar: true, uebernommen: false }, { verfuegbar: false }]) {
      const w = welt(); await enqueue(w, "source_fetch", { freshnessWindow: "2026-11-13T00Z" });
      const u = await enqueue(w, "document_understanding"); w.deps.zurueckstellen = async () => rueckgabe;
      w.deps.handler = { source_fetch: async () => A.fail("Kein historischer Abruf"),
        document_understanding: async () => A.fail("Keine Fortsetzung ohne Rueckgabe") };
      const r = await w.run(); A.equal(r.bilanzen[0].verfuegbar, false);
      A.equal(r.bilanzen[0].zurueckstellungNichtVerfuegbar, 1); A.equal(w.q.hole(u.id).attempts, 0);
    }
    const w = welt(); let n = 0;
    const r = await stub(w, async () => ++n === 3 ? bilanz({ leaseVerloren: 1 }) : bilanz());
    A.equal(n, 3); A.equal(r.bilanzen[0].verfuegbar, false);
    const offen = welt(), quelle = await enqueue(offen, "source_fetch");
    let fertig, laufend, calls = 0;
    offen.deps.handler = { source_fetch: () => new Promise(resolve => { fertig = resolve; }) };
    try {
      const result = await stub(offen, async o => {
        if (++calls === 1) return bilanz();
        const c = await o.deps.claim({ owner: o.owner, limit: 1, leaseMs: o.leaseMs, types: o.types });
        laufend = o.deps.handler.source_fetch({ id: c.auftraege[0].id }, o.deps, {});
        // Wie nach Promise.race: der Jobretry ist bestaetigt, der originale
        // Handler wartet noch. Keine echte Wartezeit oder Modelldoppelarbeit.
        await offen.q.finish({ id: quelle.id, owner: o.owner, ok: false, retryDelayMs: 30000 });
        const next = await o.deps.claim({ owner: o.owner, limit: 1, leaseMs: o.leaseMs, types: o.types });
        A.equal(next.verfuegbar, false); A.equal(next.grund, "abrufphase-ausgang-offen");
        return bilanz({ reserviert: 1, wiederholt: 1 });
      });
      A.equal(calls, 2); A.equal(result.bilanzen[0].verfuegbar, false);
      A.equal(result.bilanzen[0].grund, "abrufphase-ausgang-offen");
    } finally { if (fertig) fertig({ ok: true }); if (laufend) await laufend; }
  });
  await test("Bestaetigter Einzelabrufretry oder Endfehler laesst Understanding weiterarbeiten und spiegelt nur einmal", async () => {
    for (const maxAttempts of [1, 3]) {
      const w = welt(); await enqueue(w, "mandate_projection");
      const fehler = await enqueue(w, "source_fetch", { maxAttempts });
      const gut = await enqueue(w, "source_fetch"), u = await enqueue(w, "document_understanding");
      w.deps.handler = {
        mandate_projection: async () => { w.weiter(1000); return { ok: true }; },
        source_fetch: async (a, d) => {
          d.blobSpiegel.sammle([{ id: "synthetisch-" + a.id }]); w.weiter(1000);
          if (a.id === fehler.id) throw Error("synthetischer Abruffehler"); return { ok: true };
        }, document_understanding: async () => { w.weiter(1000); return { ok: true }; }
      };
      const r = await w.run(), b = r.bilanzen[0];
      A.equal(w.q.hole(gut.id).status, "erledigt"); A.equal(w.q.hole(u.id).status, "erledigt");
      A.equal(w.q.hole(fehler.id).status, maxAttempts === 1 ? "fehlgeschlagen" : "wartend");
      A.equal(b.verfuegbar, true); A.equal(b.phasen.length, 3); A.equal(b.reserviert, 4); A.equal(b.erledigt, 3);
      A.equal(b.wiederholt + b.endgueltigFehlgeschlagen, 1);
      A.equal(w.writes.length, 1); A.equal(w.writes[0].length, 2); A.equal(r.blobSpiegel.gesammelt, 2);
      A.equal(w.slots.filter(s => s === "worker-drain").length, 1); A.equal(w.quotas.length, 3);
    }
  });
  await test("Explizite heutige Wiederbeobachtung gilt aus Claimmetadaten ohne Publikationsdatum umzudeuten", async () => {
    const w = welt(), quelle = await enqueue(w, "source_fetch", { freshnessWindow: "2026-11-12T00Z",
      payload: { published_at: "2006-06-11T12:00:00Z" } });
    w.q.hole(quelle.id).last_seen_window = HEUTE;
    w.deps.handler = { source_fetch: async a => { w.trace.push(a.freshnessWindow); return { ok: true }; } };
    const r = await w.run();
    A.equal(w.q.hole(quelle.id).status, "erledigt"); A.deepEqual(w.trace, ["2026-11-12T00Z"]);
    A.equal(r.bilanzen[0].phasen[1].erledigt, 1); A.equal(r.bilanzen[0].verfuegbar, true);
  });
  A.equal(count, 8);
  console.log(`${count}/${count} neue Quellenabruf-Arbeitsanteilgruppen bestanden; keine Modelle Datenbank oder alten Tests.`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
