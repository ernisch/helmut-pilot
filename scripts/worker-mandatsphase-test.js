"use strict";

// Nur neue Verkettungsgrenzen: echter Worker und vorhandener kleiner Queue-Treiber,
// virtuelle Zeit, keine DB/HTTP/Modelle und keine historischen Mengenfaelle.
const A = require("node:assert/strict"), W = require("../lib/helmut/worker-betrieb"),
  P = require("../lib/helmut/scalable-pipeline"), F = require("../lib/helmut/quellen-arbeitsfenster");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
const ENV = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on",
  HELMUT_SOURCE_MODE: "on", HELMUT_JOB_DISPATCH_MODE: "shadow", HELMUT_QUELLEN_FENSTER_TAG: "8",
  HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16" };
function bilanz(extra = {}) {
  return { uebersprungen: false, verfuegbar: true, grund: null, reserviert: 0, erledigt: 0,
    wiederholt: 0, endgueltigFehlgeschlagen: 0, leaseVerloren: 0, nichtUebernommen: 0,
    zurueckgestellt: 0, kurzZurueckgestellt: 0, zurueckstellungNichtVerfuegbar: 0,
    stapelrestZurueckgegeben: 0, stapelrestNichtZurueckgegeben: 0, leerlaufWarten: 0,
    dauerMs: 0, verarbeitet: 0, nachTyp: {}, zurueckstellGruende: {}, ...extra };
}
function welt() {
  let zeit = Date.parse("2026-11-13T03:00:00Z");
  const w = { now: () => zeit, weiter: ms => { zeit += ms; }, quotas: [], slots: [], trace: [], writes: [] };
  w.q = erzeugeSpeicherWarteschlange({ now: w.now });
  w.klassen = { belege: async klasse => { w.slots.push(klasse); return { erlaubt: true, slot: "synthetisch-" + klasse }; },
    gebeFrei: async () => {} };
  w.deps = { now: w.now, klassen: w.klassen, claim: w.q.claim, finish: w.q.finish,
    extendLease: w.q.extendLease, zurueckstellen: w.q.zurueckstellen,
    saveRawItems: async items => { w.writes.push(structuredClone(items)); return items; },
    budget: { reserviere: async () => A.fail("Kein Modellbudget in dieser Regression") } };
  w.run = (options = {}) => F.fuehreAus({ env: ENV, deps: { now: w.now, klassen: w.klassen,
    bereitschaft: async () => ({ bereit: true }), automatik: async () => ({ erlaubt: true }),
    reserviere: async o => { w.quotas.push(o); return { verfuegbar: true, erlaubt: true }; } },
    arbeit: ({ freigabe }) => W.durchlauf({ env: ENV, deps: w.deps, kennung: "synthetischer-lauf",
      arbeitsfenster: freigabe, grenzen: { budgetMs: 290000, parallel: 8, stapel: 200 }, ...options }) });
  return w;
}
async function stub(w, fn, options) {
  const old = P.arbeite; P.arbeite = fn;
  try { return await w.run(options); } finally { P.arbeite = old; }
}
async function enqueue(w, typ, priority) {
  return w.q.enqueue({ jobType: typ, priority, idempotencyKey: typ + "|" + w.q.groesse(),
    freshnessWindow: "2026-11-13T00Z", tenantId: /projection|materialization/.test(typ) ? "synthetisches-mandat" : null,
    payload: { mandatsId: "synthetisches-mandat" } });
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Faellige Projektion und Paket machen vor hoeher priorisierter Quellenarbeit Fortschritt", async () => {
    const w = welt(), projection = await enqueue(w, "mandate_projection", 200), paket = await enqueue(w, "briefing_materialization", 250);
    await enqueue(w, "document_understanding", 80);
    for (let i = 0; i < 5; i++) await enqueue(w, "source_fetch", 100);
    const teuer = async (a, d, c) => {
      w.trace.push(a.jobType);
      const rest = c.auftragsDeadlineMs - w.now();
      if (rest < 60000) { w.weiter(Math.max(0, rest)); return { zurueckgestellt: true, zeitbudgetErschoepft: true }; }
      w.weiter(60000); return { ok: true };
    };
    w.deps.handler = { source_fetch: teuer, document_understanding: teuer,
      mandate_projection: async a => { w.trace.push(a.jobType); w.weiter(1000); return { ok: true }; },
      briefing_materialization: async a => {
        A.equal(w.q.hole(projection.id).status, "erledigt"); w.trace.push(a.jobType); w.weiter(1000); return { ok: true };
      } };
    const r = await w.run();
    A.deepEqual(w.trace.slice(0, 2), ["mandate_projection", "briefing_materialization"]);
    A.equal(w.q.hole(paket.id).status, "erledigt"); A(w.q.zaehle(j => j.status === "wartend") > 0);
    A(w.trace.includes("source_fetch")); A.equal(r.worker, 1); A.equal(r.grenzen.stapel, 1);
    A.equal(w.slots.filter(k => k === "worker-drain").length, 1);
    A.equal(w.quotas.length, 3); A.equal(w.now() < Date.parse("2026-11-13T03:05:00Z"), true);
  });
  await test("Mandatsbudget bleibt unter45s und20Prozent und Restzeit beginnt nicht erneut", async () => {
    for (const budgetMs of [25000, 100000, 290000]) {
      const w = welt(), calls = [], plan = { synthetisch: "unveraendert" };
      const r = await stub(w, async o => {
        calls.push(o); A.equal(o.tagesplan, plan); A.equal(o.deps.klassen, w.klassen);
        A.equal(o.stapel, 1); w.weiter(o.budgetMs); return bilanz({ dauerMs: o.budgetMs });
      }, { grenzen: { budgetMs, parallel: 8, stapel: 200 }, tagesplan: plan });
      A.equal(calls.length, 2); A.equal(calls[0].budgetMs, Math.min(45000, budgetMs / 5));
      A.deepEqual(calls[0].types, ["mandate_projection", "briefing_materialization"]);
      A.equal(calls[1].budgetMs, budgetMs - calls[0].budgetMs); A(calls[1].budgetMs >= budgetMs * 0.8);
      A.equal(calls[0].owner, calls[1].owner); A.equal(calls[0].deps.blobSpiegel, calls[1].deps.blobSpiegel);
      A.equal(r.bilanzen.length, 1); A.equal(r.bilanzen[0].dauerMs, budgetMs);
    }
  });
  await test("Unvollstaendiger Plan schraenkt Typen weiter strikt ein und kleine Budgets erhalten Quellenarbeit", async () => {
    const w = welt(), calls = [];
    await stub(w, async o => { calls.push(o); return bilanz(); }, { typen: ["source_fetch", "document_understanding"] });
    A.equal(calls.length, 1); A.deepEqual(calls[0].types, ["source_fetch", "document_understanding"]);
    const klein = welt(), k = [];
    await stub(klein, async o => { k.push(o); return bilanz(); }, { grenzen: { budgetMs: 24999 } });
    A.equal(k.length, 1); A.equal(k[0].budgetMs, 24999); A.equal(k[0].types, null);
    const nurPaket = welt(), p = [];
    await stub(nurPaket, async o => { p.push(o); return bilanz(); }, { typen: ["briefing_materialization"] });
    A(p.every(o => o.types.length === 1 && o.types[0] === "briefing_materialization"));
  });
  await test("Ohne echte Freigabe bleibt Claim gesperrt und nurNarrativ bekommt keine Mandatsphase", async () => {
    const old = P.arbeite, calls = []; P.arbeite = async o => { calls.push(o); return bilanz(); };
    try {
      for (const arbeitsfenster of [null, { endeMs: Date.now() + 300000 }])
        A.equal((await W.durchlauf({ env: ENV, arbeitsfenster })).grund, "arbeitsfenster-nicht-reserviert");
      A.equal(calls.length, 0);
      await W.durchlauf({ env: ENV, deps: {}, typen: ["tenant_narrative"], grenzen: { parallel: 1 } });
      A.equal(calls.length, 1); A.deepEqual(calls[0].types, ["tenant_narrative"]);
      calls.length = 0;
      await W.durchlauf({ env: { ...ENV, HELMUT_QUELLEN_ARBEITSFENSTER: "off" }, grenzen: { parallel: 1 } });
      A.equal(calls.length, 1); A.equal(calls[0].types, null);
    } finally { P.arbeite = old; }
  });
  await test("Ausgeglichener Einzeljobfehler erlaubt Quellenphase und Bilanz sowie Blobspiegel bleiben gemeinsam", async () => {
    const w = welt(); let n = 0;
    const r = await stub(w, async o => {
      o.deps.blobSpiegel.sammle([{ id: "synthetisch-" + n }]); w.weiter(1000);
      return n++ === 0 ? bilanz({ reserviert: 4, erledigt: 1, endgueltigFehlgeschlagen: 1, zurueckgestellt: 1, stapelrestZurueckgegeben: 1,
        nichtUebernommen: 0, kurzZurueckgestellt: 1, nachTyp: { mandate_projection: { erledigt: 1, fehler: 1 } },
        zurueckstellGruende: { klassengrenze: 1 } })
        : bilanz({ reserviert: 1, erledigt: 1, nachTyp: { source_fetch: { erledigt: 1, fehler: 0 } } });
    });
    A.equal(n, 2); A.equal(r.reserviert, 5); A.equal(r.erledigt, 2); A.equal(r.endgueltigFehlgeschlagen, 1);
    A.equal(r.zurueckgestellt, 1); A.equal(r.bilanzen.length, 1); A.equal(r.bilanzen[0].phasen.length, 2);
    A.equal(r.bilanzen[0].nachTyp.mandate_projection.fehler, 1);
    A.equal(r.bilanzen[0].stapelrestZurueckgegeben, 1);
    A.equal(r.bilanzen[0].zurueckstellGruende.klassengrenze, 1);
    A.equal(w.writes.length, 1); A.equal(w.writes[0].length, 2); A.equal(r.blobSpiegel.gesammelt, 2);
  });
  await test("Ungeklaerte Mandatsphase Claimfehler oder Leaseverlust starten keine Quellenphase", async () => {
    for (const extra of [{ verfuegbar: false, grund: "warteschlange-nicht-verfuegbar" }, { leaseVerloren: 1 },
      { nichtUebernommen: 1 }, { zurueckstellungNichtVerfuegbar: 1 }, { stapelrestNichtZurueckgegeben: 1 },
      { wiederholt: 1 }, { reserviert: 1 }, { erledigt: undefined }]) {
      const w = welt(); let calls = 0;
      const r = await stub(w, async () => { calls++; return bilanz(extra); });
      A.equal(calls, 1); A.equal(r.bilanzen[0].phasen.length, 1);
      A.equal(r.bilanzen[0].verfuegbar, false); A(r.bilanzen[0].grund);
      if (extra.leaseVerloren) A.equal(r.leaseVerloren, 1);
      if (extra.verfuegbar === false) A.equal(r.bilanzen[0].verfuegbar, false);
    }
    for (const fehlend of [null, undefined]) {
      const w = welt(); let calls = 0;
      const r = await stub(w, async () => { calls++; return fehlend; });
      A.equal(calls, 1); A.equal(r.bilanzen[0].verfuegbar, false);
      A.equal(r.bilanzen[0].grund, "mandatsphase-ausgang-nicht-bestaetigt");
    }
  });
  await test("Bestaetigter begrenzter Mandatsretry blockiert anschliessende Quellenarbeit nicht", async () => {
    const w = welt(), projection = await enqueue(w, "mandate_projection", 200), quelle = await enqueue(w, "source_fetch", 100);
    w.deps.handler = {
      mandate_projection: async a => { w.trace.push(a.jobType); throw Error("synthetischer Matchingfehler"); },
      source_fetch: async a => { w.trace.push(a.jobType); w.weiter(1000); return { ok: true }; }
    };
    const r = await w.run();
    A.deepEqual(w.trace, ["mandate_projection", "source_fetch"]);
    A.equal(w.q.hole(projection.id).status, "wartend"); A.equal(w.q.hole(projection.id).attempts, 1);
    A.equal(w.q.hole(quelle.id).status, "erledigt");
    A.equal(r.wiederholt, 1); A.equal(r.erledigt, 1); A.equal(r.bilanzen[0].verfuegbar, true);
    A.equal(r.bilanzen[0].phasen.length, 2);
  });
  await test("Spaeter Quellen-Claimfehler bleibt trotz vorher bestaetigter Mandatsarbeit unverfuegbar", async () => {
    const w = welt(); let n = 0;
    const r = await stub(w, async () => n++ === 0 ? bilanz({ reserviert: 1, erledigt: 1 })
      : bilanz({ verfuegbar: false, grund: "synthetischer Speicherfehler" }));
    A.equal(r.erledigt, 1); A.equal(r.bilanzen.length, 1); A.equal(r.bilanzen[0].verfuegbar, false);
    A.equal(r.bilanzen[0].grund, "synthetischer Speicherfehler");
    A.equal(r.bilanzen.some(b => b.verfuegbar !== false), false);
  });
  await test("Unterbrechung nach bestaetigter Projektion verliert deren Abschluss nicht", async () => {
    const w = welt(), job = await enqueue(w, "mandate_projection", 200); let claims = 0;
    w.deps.handler = { mandate_projection: async () => { w.weiter(1000); return { ok: true }; } };
    w.deps.claim = async o => { if (++claims === 2) throw Error("synthetische Unterbrechung"); return w.q.claim(o); };
    await A.rejects(w.run(), /synthetische Unterbrechung/);
    A.equal(w.q.hole(job.id).status, "erledigt"); A.equal(w.q.hole(job.id).attempts, 1);
    A.equal(w.q.hole(job.id).lease_owner, null); A.equal(w.writes.length, 0);
  });
  console.log(`${count}/${count} neue Worker-Mandatsphasen-Gruppen bestanden; keine externen Aufrufe.`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
